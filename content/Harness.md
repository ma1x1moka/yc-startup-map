---
description: Everything wrapped around the model that turns it into an agent: tools, system prompt, context management, permissions and hooks.
---

The [model](./Model.md) predicts [tokens](./Token.md); the harness does all the rest. It assembles the [context](./Context.md) for each request, exposes [tools](./Tool.md) and actually executes them, decides what to do with [tool results](./Tool%20result.md), enforces permissions, manages [compaction](./Compaction.md), and decides when a [turn](./Turn.md) is over. Your CLI, your editor plugin and your chat app are all harnesses.

Most of what people experience as model quality is really harness quality. The same model can feel sharp in one tool and hopeless in another because one loaded the right files and kept the window clean while the other stuffed it with noise. When something goes wrong, asking whether it is a model problem or a harness problem narrows the search enormously — and it is usually the harness.

_Usage:_

"This model is much worse than the one at work."

"Same model — different harness. Ours isn't loading the project docs."
