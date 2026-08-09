---
description: What the model actually does. It samples one token from the context, appends it, and runs again. Its only mode of operation.
---

There is no plan held in reserve and no draft revised behind the scenes. Each [token](./Token.md) is chosen from a probability distribution over the vocabulary given everything in the [context](./Context.md) so far, appended, and the whole context is run through again for the next one. Fluent paragraphs and working functions are what this loop produces at scale, not evidence of a different mechanism underneath.

Holding onto this explains behaviour that otherwise looks bizarre. The [model](./Model.md) never checks whether a token is true before emitting it, only whether it is likely — which is the root of [hallucination](./Hallucination.md). It cannot unsay a token, so a confident wrong opening sentence drags the rest of the answer along with it. And because tokens come out strictly one at a time, generation speed puts a hard ceiling on how fast any [agent](./Agent.md) can work.

_Usage:_

"Why did it double down on a wrong answer?"

"It committed to the opening claim, and next-token prediction made the rest follow from it."
