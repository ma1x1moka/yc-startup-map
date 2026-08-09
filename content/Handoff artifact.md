---
description: The durable document that carries work across a context boundary. Written to disk, loaded into the next session.
---

This is the physical form of a [handoff](./Handoff.md): a file capturing current state, remaining work, settled decisions and the reasoning behind them. It exists precisely because the [filesystem](./Filesystem.md) outlives the [context window](./Context%20window.md).

Good ones are short and decision-dense — what was chosen, what was rejected, what is still open. Bad ones narrate the [session](./Session.md) chronologically and reproduce the original problem, which is that the next window fills with material nobody needs.

_Usage:_

"What do I put in it?"

"Decisions and open questions. Not a transcript of how we got here."
