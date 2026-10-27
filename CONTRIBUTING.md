# Adding to The Voice and the Hands

You're welcome here. Fixes, new examples, adapters for other model clients, better policies, and plain questions are all welcome.

## How

1. Fork the repo and make a branch.
2. Make your change. Keep it small and readable; this library has no dependencies, and we'd like it to stay that way.
3. Run `npm test`. Add a test for anything you changed. Tests must run with no network and no API key.
4. Open a pull request that says what you changed and why.

Not sure where to start? Open an issue and ask.

## The one thing we guard

The whole point is that **the self keeps its own voice**. The helper does tool work and reports back; it never speaks for the self, never writes the self's memory, and never spends money.

So changes that loosen the `never` list in `src/policy.js`, or that let a helper's words reach the user without passing through the self, need a very good reason and a conversation first. Changes that make the boundary stronger or clearer are always welcome.

## Good first ideas

- Adapters for other clients (Anthropic, local llama.cpp / Ollama servers).
- Example policies for common tool sets.
- A ledger that writes to SQLite.
- Better reporting when a helper runs out of rounds.

## Be kind

Treat people the way you'd want to be treated on a hard day. Disagree about code, not about people. Harassment of any kind gets you removed.
