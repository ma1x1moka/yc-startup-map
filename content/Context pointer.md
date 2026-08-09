---
description: A cheap reference to material the agent can load when needed, instead of the material itself.
---

A file path, a URL, a [tool](./Tool.md) name or a one-line index entry — enough for the [agent](./Agent.md) to know something exists and to go get it. The cost is a handful of [tokens](./Token.md) rather than the full document.

Pointers only work if the agent can actually follow them, which means the retrieval tool must exist and the reference must be accurate. A pointer to a file that has moved is worse than nothing: it produces a failed lookup and, often, a guess in its place.

_Usage:_

"I listed the docs instead of pasting them."

"Good — as long as it has a tool that can open them."
