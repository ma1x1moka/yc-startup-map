---
description: The tokens the harness sends on each request. Billed at a lower rate than output tokens.
---

Everything the [model](./Model.md) reads counts: [system prompt](./System%20prompt.md), [tool](./Tool.md) definitions, every earlier message, every [tool result](./Tool%20result.md), and the files you pulled in. On a mature [session](./Session.md) this dwarfs whatever you just typed.

Input is cheap per [token](./Token.md) and enormous in volume, which makes it the quiet driver of cost. The lever is not typing less; it is loading less and keeping the window free of material the task does not need.

_Usage:_

"I only asked a one-line question."

"And shipped 90k input tokens of history with it."
