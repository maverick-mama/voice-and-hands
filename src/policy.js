'use strict';
/**
 * Which of the self's tools the helper may touch.
 *
 * Three lists, checked in this order:
 *   never  — withheld whatever the config says: the self's voice (messages,
 *            posts), its memory, and anything that spends money.
 *   read   — always handed over: list / read / search / web.
 *   write  — handed over only when allowWrites is true.
 * Anything matching none of them is withheld. Unknown means no.
 */

const DEFAULT_POLICY = {
  read:  [/^(web_search|read_link)$/, /_(list|read|search|query)$/],
  write: [/_(write|append|move|mkdir|add)$/],
  never: [
    /^delegate_task$/,                                   // no helpers of helpers
    /^(send_|message_|post_|reply_|notify)/,             // the self's voice
    /^(memory_|remember|pin_|anchor_|journal_|diary_)/,  // the self's memory
    /^(generate_|buy_|order_|pay_|place_order)/,         // spending
  ],
  allowWrites: false,
};

const nameOf = t => t?.function?.name || t?.name;
const hits = (list, name) => (list || []).some(rx => rx.test(name));

function allowed(name, policy = DEFAULT_POLICY) {
  if (!name || hits(policy.never, name)) return false;
  if (hits(policy.read, name)) return true;
  return !!policy.allowWrites && hits(policy.write, name);
}

function filterTools(tools, policy = DEFAULT_POLICY) {
  return (tools || []).filter(t => allowed(nameOf(t), policy));
}

module.exports = { DEFAULT_POLICY, allowed, filterTools, nameOf };
