'use strict';
/**
 * A minimal OpenAI-style chat call with a tool loop, pointed at OpenRouter by
 * default. Any endpoint that speaks /chat/completions with `tools` works.
 *
 * Returns { text, cost }. `cost` is summed across every call in the loop,
 * read from OpenRouter's usage accounting (0 elsewhere).
 */

const DEFAULT_URL = 'https://openrouter.ai/api/v1/chat/completions';

function createChat({ apiKey = process.env.OPENROUTER_API_KEY, url = DEFAULT_URL, maxRounds = 10 } = {}) {
  return async function chat({ model, system, messages, tools, executeTool, maxTokens = 3000 }) {
    if (!apiKey) throw new Error('No API key: set OPENROUTER_API_KEY or pass apiKey.');
    const convo = [{ role: 'system', content: system }, ...messages];
    let cost = 0;

    const call = async () => {
      const body = { model, messages: convo, max_tokens: maxTokens, usage: { include: true } };
      if (tools?.length) body.tools = tools;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 300)}`);
      const data = await res.json();
      cost += Number(data.usage?.cost) || 0;
      return data.choices?.[0]?.message || {};
    };

    let msg = await call();
    for (let round = 0; msg.tool_calls?.length && round < maxRounds; round++) {
      convo.push(msg);
      for (const tc of msg.tool_calls) {
        let result;
        try {
          const args = typeof tc.function.arguments === 'string' ? JSON.parse(tc.function.arguments || '{}') : (tc.function.arguments || {});
          result = await executeTool(tc.function.name, args);
        } catch (e) {
          result = { error: e.message };
        }
        convo.push({ role: 'tool', tool_call_id: tc.id, content: typeof result === 'string' ? result : JSON.stringify(result) });
      }
      msg = await call();
    }
    return { text: String(msg.content || ''), cost };
  };
}

module.exports = { createChat };
