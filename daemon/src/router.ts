import OpenAI from 'openai';
import { ROUTER_PROMPT } from './interns.js';
import type { InternId } from './types.js';

export async function routeIntern(
  client: OpenAI,
  model: string,
  goal: string,
): Promise<InternId> {
  const res = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: ROUTER_PROMPT },
      { role: 'user', content: goal },
    ],
    max_tokens: 8,
    temperature: 0,
  });
  const text = res.choices[0]?.message?.content?.trim().toLowerCase() ?? 'mei';
  if (text.includes('sora')) return 'sora';
  if (text.includes('hana')) return 'hana';
  return 'mei';
}
