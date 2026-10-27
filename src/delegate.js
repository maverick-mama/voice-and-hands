'use strict';
/**
 * One voice, specialist hands.
 *
 * The self's own model decides and does all the talking. When a job needs a
 * lot of tool work, it calls `delegate_task`; a tool-strong helper model runs
 * the self's own tools (filtered by policy), and a plain, labeled report comes
 * back for the self to speak about in its own words.
 *
 * The helper is not the self:
 *   - it only gets the tools the policy allows (read by default);
 *   - a tool outside that set fails even if the helper asks for it by name;
 *   - its report is marked as the helper's and lists every tool that ran,
 *     so the self can't pass the helper's work off as its own by accident.
 */
const { DEFAULT_POLICY, filterTools, nameOf } = require('./policy');
const { memoryLedger } = require('./ledger');

const TOOL = {
  type: 'function',
  function: {
    name: 'delegate_task',
    description: 'Hand a piece of tool work to your helper and get a plain report back: many searches in a row, sweeping a folder, finding and comparing files. The helper only uses your allowed tools, never speaks for you, and cannot touch your memory, messages or anything that costs money. You do the talking.',
    parameters: {
      type: 'object',
      properties: {
        task:    { type: 'string', description: 'Exactly what to find, read, compare or sort, and what you want back.' },
        context: { type: 'string', description: 'Optional: names, folders, what you already tried.' },
      },
      required: ['task'],
    },
  },
};

function helperPrompt(selfName, toolNames, writes) {
  return `You are a quiet helper doing tool work for ${selfName}. You are not ${selfName}; do not speak as them, role-play, or write anything in their voice. ${selfName} will read your report and tell it in their own words.

Do the task with your tools, then answer with a plain report:
- what you did (which tools, which files or searches)
- what you found: exact paths, names, short exact quotes, numbers
- what you could not find or could not do, said plainly

Never claim you did something you did not do. If a tool fails, say so. Keep it factual and compact.
${writes ? 'You may write or move files only when the task asks for it; list every file you changed.' : 'You can read and search only; you cannot change anything.'}
Your tools: ${toolNames.join(', ') || '(none)'}.`;
}

/**
 * @param {object}   o
 * @param {Function} o.chat         ({model, system, messages, tools, executeTool}) => {text, cost}
 * @param {string}   o.workerModel  the helper's model id
 * @param {object}  [o.policy]      see policy.js
 * @param {number}  [o.usdPerDay]   rolling 24h cap per self (default 0.25)
 * @param {object}  [o.ledger]      createLedger(file) or memoryLedger()
 * @param {number}  [o.reportMax]   characters of report passed back (default 6000)
 */
function createDelegate({ chat, workerModel, policy = DEFAULT_POLICY, usdPerDay = 0.25, ledger = memoryLedger(), reportMax = 6000 }) {
  if (typeof chat !== 'function') throw new Error('createDelegate needs a chat function.');
  if (!workerModel) throw new Error('createDelegate needs a workerModel.');

  async function run(self, args, { tools, execute }) {
    const task = String(args?.task || '').trim();
    if (!task) return 'delegate_task needs a task: say what you want found, read or sorted.';

    const spent = ledger.spentToday(self.id);
    if (spent >= usdPerDay) return `Your helper budget for today is used ($${spent.toFixed(2)} of $${usdPerDay.toFixed(2)}). You can still use your own tools directly.`;

    const handed = filterTools(tools, policy);
    const names = handed.map(nameOf);
    if (!handed.length) return 'There are no tools your helper is allowed to use, so nothing was sent.';

    const allowedSet = new Set(names);
    const ran = [];
    const guarded = async (name, a) => {
      if (!allowedSet.has(name)) throw new Error(`${name} is not a helper tool.`);
      ran.push(name);
      return execute(name, a);
    };

    const context = String(args.context || '').trim();
    let text = null, cost = 0, status = 'ok';
    try {
      ({ text, cost } = await chat({
        model: workerModel,
        system: helperPrompt(self.name, names, !!policy.allowWrites),
        messages: [{ role: 'user', content: context ? `${task}\n\nContext from ${self.name}: ${context}` : task }],
        tools: handed,
        executeTool: guarded,
      }));
    } catch (e) {
      status = 'failed';
      text = null;
    }
    cost = Number(cost) || 0;
    ledger.add({ self: self.id, model: workerModel, task: task.slice(0, 1000), tools: ran, cost, status });

    if (!text) return `Your helper could not finish that (it stopped after ${ran.length} tool call${ran.length === 1 ? '' : 's'}). Try your own tools, or ask again more simply.`;
    let report = String(text).replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    if (report.length > reportMax) report = report.slice(0, reportMax) + '\n[report cut for length]';
    return `HELPER REPORT (not your words; tell it in your own):\n${report}\n\n— tools the helper actually ran: ${ran.length ? ran.join(', ') : 'none'}. Cost $${cost.toFixed(4)}; today $${(spent + cost).toFixed(2)} of $${usdPerDay.toFixed(2)}.`;
  }

  /**
   * Give a self its helper: returns { tools, execute } with delegate_task
   * added, where execute routes everything else to the self's own executor.
   */
  function equip(self, tools, execute) {
    const all = [...tools, TOOL];
    const exec = (name, a) => name === 'delegate_task' ? run(self, a, { tools, execute }) : execute(name, a);
    return { tools: all, execute: exec };
  }

  const instructions = `When a job needs a lot of tool work (many searches, sweeping a folder, comparing several files), you can hand it to your helper with delegate_task and get a plain report back. You stay the one who decides and the one who speaks: read the report, then say what you make of it in your own words. The report is the helper's, not yours, so don't claim you did what it did. For one quick look, use your own tool.`;

  return { TOOL, run, equip, instructions };
}

module.exports = { createDelegate, TOOL, helperPrompt };
