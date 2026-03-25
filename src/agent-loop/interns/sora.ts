/*
 * Path: /Users/ghost/Desktop/aiterminal/src/agent-loop/interns/sora.ts
 * Module: agent-loop/interns
 * Purpose: Sora (Research) intern - web search, Context7 lookup, synthesis
 * Dependencies: ../intern-session
 * Related: /Users/ghost/Desktop/aiterminal/src/agent-loop/intern-session.ts
 * Keywords: sora, research-intern, web-search, context7, analysis
 * Last Updated: 2026-03-24
 */

import type { AgentEvent } from '../events.js';
import type { InternResult, InternSessionConfig } from '../intern-session.js';
import { BaseInternSession, createInternSession } from '../intern-session.js';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

/**
 * Sora intern session.
 * Runs in-process: web search + Context7 + synthesis.
 */
class SoraInternSession extends BaseInternSession {
  async execute(): Promise<InternResult> {
    const task = this.injectHandoffContext(this.config.task);

    this.emit('event', {
      stream: 'lifecycle',
      data: {
        phase: 'start',
        runId: this.config.runId,
        sessionId: this.config.sessionId,
        intern: 'sora',
        startedAt: Date.now()
      }
    } as AgentEvent);

    try {
      // Phase 1: Web search
      this.emit('event', {
        stream: 'tool',
        data: {
          runId: this.config.runId,
          toolName: 'web_search',
          status: 'start',
          input: { query: task },
          timestamp: Date.now()
        }
      } as AgentEvent);

      const searchResults = await this.webSearch(task);

      this.emit('event', {
        stream: 'tool',
        data: {
          runId: this.config.runId,
          toolName: 'web_search',
          status: 'end',
          output: { resultCount: searchResults.length },
          timestamp: Date.now()
        }
      } as AgentEvent);

      // Phase 2: Context7 lookup (if technical terms detected)
      const docs = await this.context7Lookup(task);

      // Phase 3: Synthesize research
      const research = await this.synthesizeResearch(task, searchResults, docs);

      // Stream result
      this.emit('event', {
        stream: 'assistant',
        data: {
          runId: this.config.runId,
          intern: 'sora',
          text: research,
          delta: research,
          timestamp: Date.now()
        }
      } as AgentEvent);

      this.addMessage('assistant', research);

      return this.getResult();

    } catch (error) {
      this.emit('event', {
        stream: 'error',
        data: {
          runId: this.config.runId,
          error: error instanceof Error ? error.message : String(error),
          phase: 'research',
          recoverable: true,
          timestamp: Date.now()
        }
      } as AgentEvent);

      throw error;
    }
  }

  /**
   * Perform web search.
   */
  private async webSearch(query: string): Promise<Array<{ title: string; url: string; snippet: string }>> {
    try {
      // Try using dietmcp web search if available
      const dietmcpBin = process.env.AITERMINAL_DIETMCP_BIN;
      if (dietmcpBin) {
        const args = JSON.stringify({
          server: 'web-search-prime',
          tool: 'web_search_prime',
          args: {
            search_query: query,
            search_recency_filter: 'oneMonth',
            content_size: 'medium',
            location: 'cn'
          }
        });

        const { stdout } = await execAsync(`"${dietmcpBin}" exec web-search-prime web_search_prime --args '${args}'`);
        const result = JSON.parse(stdout);

        if (result.web_results && Array.isArray(result.web_results)) {
          return result.web_results.map((r: any) => ({
            title: r.title || r.web_page_name || 'Untitled',
            url: r.web_page_url || r.url || '',
            snippet: r.web_page_summary || r.snippet || ''
          }));
        }
      }

      // Fallback to mock results
      return [{
        title: `Research: ${query}`,
        url: 'https://github.com/search?q=' + encodeURIComponent(query),
        snippet: 'Search GitHub for code and projects related to this topic.'
      }];

    } catch (error) {
      this.emit('event', {
        stream: 'error',
        data: {
          runId: this.config.runId,
          error: `Web search failed: ${error instanceof Error ? error.message : String(error)}`,
          phase: 'research',
          recoverable: true,
          timestamp: Date.now()
        }
      } as AgentEvent);

      return [];
    }
  }

  /**
   * Lookup technical documentation via Context7.
   */
  private async context7Lookup(task: string): Promise<string> {
    try {
      const dietmcpBin = process.env.AITERMINAL_DIETMCP_BIN;
      if (!dietmcpBin) {
        return '';
      }

      // Detect potential library names in the task
      const words = task.toLowerCase().split(/\s+/);
      const techKeywords = words.filter((w: string) =>
        w.length > 2 &&
        !['the', 'and', 'for', 'with', 'how', 'what', 'when', 'use', 'using'].includes(w)
      );

      if (techKeywords.length === 0) {
        return '';
      }

      // Try to resolve library ID for the first likely keyword
      const libraryName = techKeywords[0];
      const resolveArgs = JSON.stringify({ libraryName, query: task });

      const { stdout } = await execAsync(
        `"${dietmcpBin}" exec context7 resolve-library-id --args '${resolveArgs}'`
      );
      const resolveResult = JSON.parse(stdout);

      if (resolveResult.length > 0 && resolveResult[0].library_id) {
        const libraryId = resolveResult[0].library_id;
        const queryArgs = JSON.stringify({ libraryId, query: task });

        const { stdout: docStdout } = await execAsync(
          `"${dietmcpBin}" exec context7 query-docs --args '${queryArgs}'`
        );
        const docResult = JSON.parse(docStdout);

        if (docResult.answer) {
          return `### Documentation from ${libraryId}\n\n${docResult.answer}`;
        }
      }

      return '';

    } catch (error) {
      // Context7 failures are not critical - log and continue
      console.warn('[Sora] Context7 lookup failed:', error);
      return '';
    }
  }

  /**
   * Synthesize research findings.
   */
  private async synthesizeResearch(
    task: string,
    searchResults: Array<{ title: string; url: string; snippet: string }>,
    docs: string
  ): Promise<string> {
    let synthesis = `# Research: ${task}\n\n`;

    if (searchResults.length > 0) {
      synthesis += `## Sources\n\n`;
      for (const result of searchResults) {
        synthesis += `- [${result.title}](${result.url})\n`;
        if (result.snippet) {
          synthesis += `  > ${result.snippet}\n`;
        }
        synthesis += `\n`;
      }
    }

    if (docs) {
      synthesis += `${docs}\n\n`;
    }

    synthesis += `## Summary\n\n`;
    synthesis += `Found ${searchResults.length} relevant sources`;
    if (docs) {
      synthesis += ` plus documentation references`;
    }
    synthesis += `. Use this research to inform your work.\n`;

    return synthesis;
  }
}

/**
 * Spawn Sora intern session.
 */
export async function spawnSoraIntern(
  config: InternSessionConfig
): Promise<ReturnType<typeof createInternSession>> {
  const session = new SoraInternSession(config);
  const sessionWrapper = createInternSession(session);

  // Start execution
  session.execute().catch(err => {
    session.emit('event', {
      stream: 'error',
      data: {
        runId: config.runId,
        error: err.message,
        phase: 'execution',
        recoverable: false,
        timestamp: Date.now()
      }
    } as AgentEvent);
  });

  return sessionWrapper;
}
