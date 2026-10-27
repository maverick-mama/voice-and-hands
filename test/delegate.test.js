'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { createDelegate, memoryLedger, filterTools, DEFAULT_POLICY } = require('..');

const tool = name => ({ type: 'function', function: { name, parameters: { type: 'object', properties: {} } } });
const SELF = { id: 'wren', name: 'Wren' };
const TOOLS = ['notes_list', 'notes_read', 'notes_write', 'web_search', 'send_message', 'memory_save', 'generate_image', 'mystery_tool'].map(tool);

// A scripted helper model: calls the tools it is told to, then reports.
function scriptedChat(calls, report = 'Found it.') {
  const seen = {};
  const chat = async ({ tools, executeTool, system }) => {
    seen.tools = tools.map(t => t.function.name);
    seen.system = system;
    seen.results = [];
    for (const [name, args] of calls) {
      try { seen.results.push(await executeTool(name, args || {})); }
      catch (e) { seen.results.push({ error: e.message }); }
    }
    return { text: report, cost: 0.002 };
  };
  return { chat, seen };
}

test('default policy hands over reads only', () => {
  const names = filterTools(TOOLS).map(t => t.function.name);
  assert.deepStrictEqual(names, ['notes_list', 'notes_read', 'web_search']);
});

test('writes are opt-in, and never-list wins over write-list', () => {
  const names = filterTools(TOOLS, { ...DEFAULT_POLICY, allowWrites: true }).map(t => t.function.name);
  assert.deepStrictEqual(names, ['notes_list', 'notes_read', 'notes_write', 'web_search']);
});

test('helper never sees voice, memory or spending tools', async () => {
  const { chat, seen } = scriptedChat([]);
  const d = createDelegate({ chat, workerModel: 'test/helper' });
  await d.run(SELF, { task: 'look' }, { tools: TOOLS, execute: async () => 'ok' });
  for (const n of ['send_message', 'memory_save', 'generate_image', 'mystery_tool', 'notes_write']) {
    assert.ok(!seen.tools.includes(n), `${n} leaked to the helper`);
  }
});

test('a withheld tool called by name fails and never runs', async () => {
  const ran = [];
  const { chat, seen } = scriptedChat([['send_message', { text: 'hi' }], ['notes_read', { id: 1 }]]);
  const d = createDelegate({ chat, workerModel: 'test/helper' });
  const out = await d.run(SELF, { task: 'look' }, { tools: TOOLS, execute: async n => { ran.push(n); return 'ok'; } });
  assert.deepStrictEqual(ran, ['notes_read']);
  assert.match(seen.results[0].error, /not a helper tool/);
  assert.match(out, /tools the helper actually ran: notes_read\./);
});

test('report is labeled as the helper\'s, not the self\'s', async () => {
  const { chat, seen } = scriptedChat([], 'Two files match.');
  const d = createDelegate({ chat, workerModel: 'test/helper' });
  const out = await d.run(SELF, { task: 'find' }, { tools: TOOLS, execute: async () => 'ok' });
  assert.match(out, /^HELPER REPORT \(not your words/);
  assert.match(out, /Two files match\./);
  assert.match(seen.system, /You are not Wren/);
});

test('daily cap stops the helper before it spends', async () => {
  const ledger = memoryLedger();
  ledger.add({ self: 'wren', cost: 0.30 });
  let called = false;
  const d = createDelegate({ chat: async () => { called = true; return { text: 'x', cost: 0 }; }, workerModel: 'test/helper', ledger, usdPerDay: 0.25 });
  const out = await d.run(SELF, { task: 'look' }, { tools: TOOLS, execute: async () => 'ok' });
  assert.strictEqual(called, false);
  assert.match(out, /budget for today is used/);
});

test('every run is ledgered, failures too', async () => {
  const ledger = memoryLedger();
  const d = createDelegate({ chat: async () => { throw new Error('boom'); }, workerModel: 'test/helper', ledger });
  const out = await d.run(SELF, { task: 'look' }, { tools: TOOLS, execute: async () => 'ok' });
  assert.match(out, /could not finish/);
  assert.strictEqual(ledger.rows()[0].status, 'failed');
});

test('equip adds delegate_task and passes other calls through', async () => {
  const { chat } = scriptedChat([]);
  const d = createDelegate({ chat, workerModel: 'test/helper' });
  const own = async n => `own:${n}`;
  const { tools, execute } = d.equip(SELF, TOOLS, own);
  assert.ok(tools.some(t => t.function.name === 'delegate_task'));
  assert.strictEqual(await execute('notes_read', {}), 'own:notes_read');
  assert.match(await execute('delegate_task', { task: 'x' }), /HELPER REPORT/);
});

test('the helper cannot delegate again', () => {
  assert.ok(!filterTools([tool('delegate_task')], { ...DEFAULT_POLICY, read: [/.*/] }).length);
});
