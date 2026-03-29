/*
 * Path: /Users/ghost/Desktop/aiterminal/src/agent-loop/router.ts
 * Module: agent-loop
 * Purpose: Main agent loop router - classifies tasks, spawns interns, manages lifecycle
 * Dependencies: ./events, ./classifier, ./intern-session
 * Related: /Users/ghost/Desktop/aiterminal/src/agent-loop/classifier.ts
 * Keywords: agent-loop, router, intern-dispatch, orchestration
 * Last Updated: 2026-03-24
 */

import { EventEmitter } from 'node:events';
import type { AgentEvent, AgentLoopConfig, AgentLoopResult } from './events.js';
import { classifyTask, shouldChainInterns, getNextIntern } from './classifier.js';
import { spawnInternSession } from './intern-session.js';
import { getTranscriptDb } from './transcript-db.js';

/**
 * Agent loop router.
 * Manages task classification, intern spawning, and event streaming.
 */
export class AgentLoopRouter extends EventEmitter {
  private activeRuns = new Map<string, AbortController>();

  /**
   * Run the agent loop for a given task.
   */
  async run(
    userMessage: string,
    config: AgentLoopConfig
  ): Promise<AgentLoopResult> {
    // Phase 1: Classify task
    const classification = classifyTask(userMessage);
    this.emit('log', {
      level: 'info',
      message: `Task classified as ${classification.intern} (${classification.confidence}): ${classification.reasoning}`
    });

    // Phase 2: Initialize transcript database
    const transcriptDb = getTranscriptDb(config.transcriptDb);

    // Create session in database
    transcriptDb.createSession({
      id: config.sessionId,
      runId: config.runId,
      intern: classification.intern,
      task: userMessage,
      workspace: config.workspaceRoot,
      metadata: {
        classification: classification,
        config: {
          timeouts: config.timeouts,
          qualityGates: config.qualityGates
        }
      }
    });

    // Phase 3: Spawn intern
    const abortController = new AbortController();
    this.activeRuns.set(config.runId, abortController);

    try {
      const internSession = await spawnInternSession({
        intern: classification.intern,
        task: userMessage,
        workspace: this.resolveInternWorkspace(classification.intern, config.workspaceRoot),
        timeout: config.timeouts[classification.intern],
        transcriptDb: config.transcriptDb,
        abortSignal: abortController.signal,
        runId: config.runId,
        sessionId: config.sessionId,
        aiQuery: config.aiQuery,
      });

      // Emit start event
      this.emit('event', {
        stream: 'lifecycle',
        data: {
          phase: 'start',
          runId: config.runId,
          sessionId: config.sessionId,
          intern: classification.intern,
          startedAt: Date.now()
        }
      } as AgentEvent);

      // Phase 4: Stream events
      for await (const event of internSession.stream()) {
        // Emit to listeners
        this.emit('event', event);

        // Record event in database
        transcriptDb.addEvent({
          sessionId: config.sessionId,
          stream: event.stream,
          data: event.data
        });

        // Record assistant messages
        if (event.stream === 'assistant' && event.data.text) {
          transcriptDb.addMessage({
            sessionId: config.sessionId,
            role: 'assistant',
            content: event.data.text,
            timestamp: event.data.timestamp || Date.now(),
            metadata: {
              intern: classification.intern,
              delta: event.data.delta
            }
          });
        }

        // Handle handoff events
        if (event.stream === 'handoff' && shouldChainInterns(classification)) {
          const nextIntern = getNextIntern(
            classification.intern,
            classification.suggestedChains!
          );

          if (nextIntern) {
            this.emit('log', {
              level: 'info',
              message: `Handing off from ${classification.intern} to ${nextIntern}`
            });

            // Close current session
            await internSession.close();

            // Spawn next intern with context
            const nextSession = await spawnInternSession({
              intern: nextIntern,
              task: event.data.recommendedAction || 'Continue based on previous findings',
              workspace: this.resolveInternWorkspace(nextIntern, config.workspaceRoot),
              timeout: config.timeouts[nextIntern],
              transcriptDb: config.transcriptDb,
              abortSignal: abortController.signal,
              runId: config.runId,
              sessionId: config.sessionId,
              contextFromHandoff: event.data,
              aiQuery: config.aiQuery,
            });

            // Stream from next intern
            for await (const nextEvent of nextSession.stream()) {
              this.emit('event', nextEvent);

              // Record event for handoff session
              transcriptDb.addEvent({
                sessionId: config.sessionId,
                stream: nextEvent.stream,
                data: nextEvent.data
              });
            }

            const nextResult = await nextSession.result();
            await nextSession.close();

            // End session with success
            transcriptDb.endSession(config.sessionId, 'completed');

            // Emit end event
            this.emit('event', {
              stream: 'lifecycle',
              data: {
                phase: 'end',
                runId: config.runId,
                sessionId: config.sessionId,
                intern: nextIntern,
                endedAt: Date.now()
              }
            } as AgentEvent);

            return {
              status: 'ok',
              result: nextResult
            };
          }
        }
      }

      // Phase 5: Get result
      const result = await internSession.result();

      // Phase 6: Quality gate
      // TODO: Implement quality gates
      const passed = true; // placeholder

      if (!passed) {
        this.emit('event', {
          stream: 'error',
          data: {
            runId: config.runId,
            error: 'Quality gate failed',
            recoverable: true,
            timestamp: Date.now()
          }
        } as AgentEvent);

        // End session with failure
        transcriptDb.endSession(config.sessionId, 'failed');

        return {
          status: 'failed',
          reason: 'quality-gate'
        };
      }

      // End session with success
      transcriptDb.endSession(config.sessionId, 'completed');

      // Emit end event
      this.emit('event', {
        stream: 'lifecycle',
        data: {
          phase: 'end',
          runId: config.runId,
          sessionId: config.sessionId,
          intern: classification.intern,
          endedAt: Date.now()
        }
      } as AgentEvent);

      await internSession.close();

      return {
        status: 'ok',
        result
      };

    } catch (error) {
      // End session with failure
      transcriptDb.endSession(config.sessionId, 'failed');

      this.emit('event', {
        stream: 'lifecycle',
        data: {
          phase: 'error',
          runId: config.runId,
          sessionId: config.sessionId,
          intern: classification.intern,
          endedAt: Date.now(),
          error: error instanceof Error ? error.message : String(error)
        }
      } as AgentEvent);

      return {
        status: 'failed',
        reason: error instanceof Error ? error.message : String(error)
      };
    } finally {
      this.activeRuns.delete(config.runId);
    }
  }

  /**
   * Abort a running agent loop.
   */
  abort(runId: string): boolean {
    const controller = this.activeRuns.get(runId);
    if (controller) {
      controller.abort();
      this.activeRuns.delete(runId);
      return true;
    }
    return false;
  }

  /**
   * Resolve workspace path for an intern.
   */
  private resolveInternWorkspace(
    intern: 'mei' | 'sora' | 'hana',
    workspaceRoot: string
  ): string {
    return `${workspaceRoot}/${intern}`;
  }
}

/**
 * Singleton instance.
 */
let routerInstance: AgentLoopRouter | null = null;

export function getAgentLoopRouter(): AgentLoopRouter {
  if (!routerInstance) {
    routerInstance = new AgentLoopRouter();
  }
  return routerInstance;
}
