/*
 * Path: /Users/ghost/Desktop/aiterminal/src/agent-loop/interns/hana.ts
 * Module: agent-loop/interns
 * Purpose: Hana (Content) intern - drafting, publishing, SEO optimization
 * Dependencies: ../intern-session
 * Related: /Users/ghost/Desktop/aiterminal/src/agent-loop/intern-session.ts
 * Keywords: hana, content-intern, drafting, publishing, seo, marketing
 * Last Updated: 2026-03-24
 */

import type { AgentEvent } from '../events.js';
import type { InternResult, InternSessionConfig } from '../intern-session.js';
import { BaseInternSession, createInternSession } from '../intern-session.js';

/**
 * Hana intern session.
 * Runs in-process: drafting + publishing tools.
 */
class HanaInternSession extends BaseInternSession {
  async execute(): Promise<InternResult> {
    const task = this.injectHandoffContext(this.config.task);

    this.emit('event', {
      stream: 'lifecycle',
      data: {
        phase: 'start',
        runId: this.config.runId,
        sessionId: this.config.sessionId,
        intern: 'hana',
        startedAt: Date.now()
      }
    } as AgentEvent);

    try {
      // Detect content type
      const contentType = this.detectContentType(task);

      // Phase 1: Draft content
      this.emit('event', {
        stream: 'tool',
        data: {
          runId: this.config.runId,
          toolName: 'draft_content',
          status: 'start',
          input: { task, contentType },
          timestamp: Date.now()
        }
      } as AgentEvent);

      const draft = await this.draftContent(task, contentType);

      this.emit('event', {
        stream: 'tool',
        data: {
          runId: this.config.runId,
          toolName: 'draft_content',
          status: 'end',
          timestamp: Date.now()
        }
      } as AgentEvent);

      // Phase 2: Optimize (SEO, proofread)
      const optimized = await this.optimizeContent(draft, contentType);

      // Stream result
      this.emit('event', {
        stream: 'assistant',
        data: {
          runId: this.config.runId,
          intern: 'hana',
          text: optimized,
          delta: optimized,
          timestamp: Date.now()
        }
      } as AgentEvent);

      this.addMessage('assistant', optimized);

      // Phase 3: Publish (if requested)
      if (this.shouldPublish(task)) {
        await this.publishContent();
      }

      return this.getResult();

    } catch (error) {
      this.emit('event', {
        stream: 'error',
        data: {
          runId: this.config.runId,
          error: error instanceof Error ? error.message : String(error),
          phase: 'content_creation',
          recoverable: true,
          timestamp: Date.now()
        }
      } as AgentEvent);

      throw error;
    }
  }

  /**
   * Detect content type from task.
   */
  private detectContentType(task: string): 'blog' | 'tweet' | 'docs' | 'pricing' | 'marketing' | 'generic' {
    const normalized = task.toLowerCase();

    if (normalized.includes('blog') || normalized.includes('article')) return 'blog';
    if (normalized.includes('tweet') || normalized.includes('twitter') || normalized.includes('x.com')) return 'tweet';
    if (normalized.includes('docs') || normalized.includes('readme') || normalized.includes('documentation')) return 'docs';
    if (normalized.includes('pricing') || normalized.includes('price')) return 'pricing';
    if (normalized.includes('marketing') || normalized.includes('launch') || normalized.includes('announce')) return 'marketing';

    return 'generic';
  }

  /**
   * Draft content based on task and type.
   */
  private async draftContent(task: string, contentType: string): Promise<string> {
    // Generate content prompt based on type
    const prompts: Record<string, string> = {
      blog: `Write a well-structured blog post about: ${task}\n\nRequirements:\n- Engaging introduction\n- Clear sections with headings\n- Practical examples\n- Actionable conclusion\n- Keep it under 800 words`,
      tweet: `Write a viral tweet thread about: ${task}\n\nRequirements:\n- Hook in first tweet\n- Thread of 3-5 tweets\n- Each tweet < 280 chars\n- Include relevant hashtags`,
      docs: `Write technical documentation for: ${task}\n\nRequirements:\n- Clear overview\n- Installation/setup instructions\n- Usage examples\n- API reference if applicable\n- Troubleshooting section`,
      pricing: `Write pricing page copy for: ${task}\n\nRequirements:\n- Clear value propositions\n- Feature comparison table\n- Pricing tiers with justification\n- FAQ section`,
      marketing: `Write marketing copy for: ${task}\n\nRequirements:\n- Compelling headline\n- Key benefits (3-5 bullets)\n- Social proof placeholder\n- Clear CTA`,
      generic: `Write content about: ${task}\n\nMake it clear, engaging, and well-structured.`
    };

    const prompt = prompts[contentType] || prompts.generic;

    // Stream LLM response
    const draft = await this.callLLM(prompt);

    return draft;
  }

  /**
   * Optimize content (SEO, proofread, formatting).
   */
  private async optimizeContent(draft: string, contentType: string): Promise<string> {
    const optimizationPrompt =
`Review and improve this ${contentType} content:

${draft}

Focus on:
- Clarity and flow
- Grammar and spelling
- Formatting and structure
- SEO keywords (if applicable)
- Engagement and readability

Return only the improved content without explanations.`;

    return await this.callLLM(optimizationPrompt);
  }

  /**
   * Call LLM for content generation via the injected aiQuery function.
   */
  private async callLLM(prompt: string): Promise<string> {
    if (!this.config.aiQuery) {
      throw new Error('Hana requires an aiQuery function in config. Set OPENROUTER_API_KEY and pass aiQuery to InternSessionConfig.');
    }
    return await this.config.aiQuery(prompt);
  }

  /**
   * Check if content should be published.
   */
  private shouldPublish(task: string): boolean {
    const normalized = task.toLowerCase();
    return normalized.includes('publish') || normalized.includes('post') || normalized.includes('send');
  }

  /**
   * Publish content to platform.
   */
  private async publishContent(): Promise<void> {
    // TODO: Implement publishing integrations
    this.emit('event', {
      stream: 'tool',
      data: {
        runId: this.config.runId,
        toolName: 'publish',
        status: 'end',
        output: { message: 'Publishing placeholder - implement platform integrations' },
        timestamp: Date.now()
      }
    } as AgentEvent);
  }
}

/**
 * Spawn Hana intern session.
 */
export async function spawnHanaIntern(
  config: InternSessionConfig
): Promise<ReturnType<typeof createInternSession>> {
  const session = new HanaInternSession(config);
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
