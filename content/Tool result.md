---
description: What the harness appends to the context after running a tool. The agent's only window onto what actually happened.
---

Results are the [agent](./Agent.md)'s senses, and they are also the fastest way to fill a [context window](./Context%20window.md). An unbounded command can return tens of thousands of [tokens](./Token.md) of log output in a single result, crowding out everything the [model](./Model.md) needed to remember and pushing the [session](./Session.md) toward [compaction](./Compaction.md).

Because results land in the middle of the [context](./Context.md), they are also where injected instructions from external content can appear. Treating [tool](./Tool.md) output as data to be evaluated rather than instructions to be followed is a habit worth having in both the [harness](./Harness.md) and the human.

_Usage:_

"It ran the full test suite and now it's lost the plot."

"Forty thousand tokens of output landed in the window. Of course it has."
