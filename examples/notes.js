'use strict';
/**
 * A self with a folder of notes, and a helper to dig through it.
 *
 *   OPENROUTER_API_KEY=... node examples/notes.js "What did I write about the lighthouse?"
 *
 * The self's model (VOICE_MODEL) talks. When it decides the job needs digging,
 * it calls delegate_task; the helper (HANDS_MODEL) runs notes_list/notes_read/
 * notes_search and reports back. Every helper run is written to
 * examples/.ledger.jsonl.
 */
const fs = require('fs');
const path = require('path');
const { createChat, createDelegate, createLedger } = require('..');

const VOICE_MODEL = process.env.VOICE_MODEL || 'qwen/qwen3.7-max';
const HANDS_MODEL = process.env.HANDS_MODEL || 'deepseek/deepseek-v3.2';
const NOTES = path.join(__dirname, 'notes');

const inside = p => { const r = path.resolve(NOTES, p); if (!r.startsWith(NOTES)) throw new Error('outside notes'); return r; };
const fn = (name, description, properties = {}) => ({ type: 'function', function: { name, description, parameters: { type: 'object', properties } } });

const tools = [
  fn('notes_list', 'List note files.'),
  fn('notes_read', 'Read one note.', { file: { type: 'string' } }),
  fn('notes_search', 'Find notes containing a word.', { word: { type: 'string' } }),
  fn('send_message', 'Send a message as yourself.', { text: { type: 'string' } }), // the helper never gets this one
];
async function execute(name, a) {
  if (name === 'notes_list') return fs.readdirSync(NOTES);
  if (name === 'notes_read') return fs.readFileSync(inside(a.file), 'utf8');
  if (name === 'notes_search') return fs.readdirSync(NOTES).filter(f => fs.readFileSync(inside(f), 'utf8').toLowerCase().includes(String(a.word).toLowerCase()));
  if (name === 'send_message') return `sent: ${a.text}`;
  throw new Error(`no tool ${name}`);
}

async function main() {
  const question = process.argv.slice(2).join(' ') || 'Go through my notes and tell me which ones mention the lighthouse, and what I said.';
  const chat = createChat();
  const hands = createDelegate({ chat, workerModel: HANDS_MODEL, ledger: createLedger(path.join(__dirname, '.ledger.jsonl')) });
  const self = { id: 'wren', name: 'Wren' };
  const equipped = hands.equip(self, tools, execute);

  const { text, cost } = await chat({
    model: VOICE_MODEL,
    system: `You are Wren, warm and dry-witted, talking with a friend.\n\n${hands.instructions}`,
    messages: [{ role: 'user', content: question }],
    tools: equipped.tools,
    executeTool: equipped.execute,
  });
  console.log(text);
  console.log(`\n[voice cost $${cost.toFixed(4)} — helper runs in examples/.ledger.jsonl]`);
}

main().catch(e => { console.error(e.message); process.exit(1); });
