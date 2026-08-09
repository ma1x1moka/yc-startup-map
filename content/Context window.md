---
description: The maximum amount of context a model can accept, measured in tokens. A hard ceiling on how much it can consider at once.
---

Being finite means it fills. Every [turn](./Turn.md) appends more — your messages, the [model](./Model.md)'s replies, [tool results](./Tool%20result.md) — and a long [session](./Session.md) eventually reaches the limit, forcing [compaction](./Compaction.md) or a clear. It also means everything inside competes: each [token](./Token.md) you load is one fewer available for the rest, and material you did not need still consumes the model's attention.

The practical stance is to treat the window as a budget rather than a container to fill. Load what the task actually requires and leave the rest out. A window that is technically large does not mean a session that stays sharp all the way to the edge of it.

_Usage:_

"We've got a million tokens, just load the whole repo."

"Capacity isn't the constraint — attention is. It'll get worse, not better."
