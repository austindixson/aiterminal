import OpenAI from 'openai';
import type { InternId, JobPhase, ToolCall } from './types.js';
import { INTERN_SYSTEM } from './interns.js';
import { routeIntern } from './router.js';
import { parseToolPlan, runTool } from './tools.js';
import { autoApproveWrites } from './config.js';

export interface LoopEmit {
  (
    jobId: string,
    phase: JobPhase,
    intern: InternId | null,
    message: string,
    meta?: { stepId?: string },
  ): void;
}

export interface ApprovalGate {
  (jobId: string, stepId: string, tool: ToolCall): Promise<boolean>;
}

const ROUTER_MODEL = process.env.AITERMINAL_GATEWAY_ROUTER_MODEL ?? 'anthropic/claude-3.5-haiku';
const AGENT_MODEL = process.env.AITERMINAL_GATEWAY_AGENT_MODEL ?? 'anthropic/claude-3.5-haiku';
const MAX_ITER = Number(process.env.AITERMINAL_GATEWAY_MAX_ITERATIONS) || 8;

/**
 * Observe → route → plan (LLM JSON tools) → execute → verify → repeat (bounded).
 */
export async function runAgentLoop(
  client: OpenAI,
  jobId: string,
  goal: string,
  workspaceRoot: string,
  emit: LoopEmit,
  approve: ApprovalGate,
): Promise<void> {
  try {
    emit(jobId, 'gather_context', null, 'Routing…');
    console.log(`[agent-loop] Starting job ${jobId}: ${goal}`);
    console.log(`[agent-loop] Using router model: ${ROUTER_MODEL}`);
    const intern = await routeIntern(client, ROUTER_MODEL, goal);
    console.log(`[agent-loop] Routed to intern: ${intern}`);
    emit(jobId, 'plan', intern, `Intern: ${intern}`);

  let context = `Goal: ${goal}\nWorkspace: ${workspaceRoot}\n`;
  let iteration = 0;

  while (iteration < MAX_ITER) {
    iteration += 1;
    emit(jobId, 'plan', intern, `Iteration ${iteration}/${MAX_ITER}`);

    console.log(`[agent-loop] Calling LLM with model: ${AGENT_MODEL}`);
    console.log(`[agent-loop] Context length: ${context.length}`);
    const res = await client.chat.completions.create({
      model: AGENT_MODEL,
      messages: [
        { role: 'system', content: INTERN_SYSTEM[intern] },
        { role: 'user', content: context },
      ],
      max_tokens: 4096,
      temperature: 0.2,
    }, {
      timeout: 60000, // 60 second timeout
    }).catch((err) => {
      console.error(`[agent-loop] LLM call failed:`, err);
      throw err;
    });
    console.log(`[agent-loop] LLM response received, choices: ${res.choices.length}`);

    const raw = res.choices[0]?.message?.content ?? '';
    console.log(`[agent-loop] LLM response (first 500 chars): ${raw.substring(0, 500)}`);
    context += `\nAssistant: ${raw}\n`;

    const tools = parseToolPlan(raw).map((t, i) => ({
      ...t,
      id: t.id || `step-${iteration}-${i}`,
    }));
    console.log(`[agent-loop] Parsed ${tools.length} tool(s) from response`);
    if (tools.length === 0) {
      emit(jobId, 'verify', intern, 'No tool JSON; finishing.');
      break;
    }

    emit(jobId, 'execute_tools', intern, `Running ${tools.length} tool(s)`);

    for (const tool of tools) {
      console.log(`[agent-loop] Executing tool: ${tool.name} with args:`, tool.args);
      if (tool.needsApproval || tool.name === 'write_file' || tool.name === 'exec' || tool.name === 'shell') {
        emit(jobId, 'await_approval', intern, `Approval: ${tool.name} ${JSON.stringify(tool.args)}`, {
          stepId: tool.id,
        });
        const ok =
          autoApproveWrites() ||
          (await approve(jobId, tool.id, tool));
        if (!ok) {
          emit(jobId, 'done', intern, 'Rejected by operator.');
          return;
        }
      }
      const result = runTool(workspaceRoot, tool);
      console.log(`[agent-loop] Tool result: ${result.ok ? 'OK' : 'ERROR'} - ${result.output.substring(0, 200)}`);
      context += `\nTool ${tool.name} result: ${result.output}\n`;
      emit(jobId, 'execute_tools', intern, result.ok ? 'Tool ok' : `Tool error: ${result.output}`);
    }

    emit(jobId, 'verify', intern, 'Verifying…');
    console.log(`[agent-loop] Calling verification LLM...`);
    const check = await client.chat.completions.create({
      model: AGENT_MODEL,
      messages: [
        {
          role: 'system',
          content:
            'You verify the last tool outputs against the user goal. Reply DONE if satisfied, or NEED_MORE: <one sentence> if another tool pass is required.',
        },
        { role: 'user', content: context.slice(-120_000) },
      ],
      max_tokens: 120,
      temperature: 0,
    }, {
      timeout: 60000,
    }).catch((err) => {
      console.error(`[agent-loop] Verification LLM failed:`, err);
      throw err;
    });
    const verdict = check.choices[0]?.message?.content?.trim() ?? 'DONE';
    console.log(`[agent-loop] Verification verdict: ${verdict}`);
    if (verdict.startsWith('DONE')) {
      emit(jobId, 'done', intern, verdict);
      console.log(`[agent-loop] Job ${jobId} completed successfully`);
      return;
    }
    context += `\nVerifier: ${verdict}\n`;
  }

  emit(jobId, 'done', intern, 'Stopped: max iterations.');
  } catch (error) {
    console.error(`[agent-loop] Error in job ${jobId}:`, error);
    throw error;
  }
}
