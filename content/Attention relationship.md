---
description: How every token in the context relates to every other. The mechanism by which more content makes each piece harder to weigh.
---

Attention is how the [model](./Model.md) decides which parts of the [context](./Context.md) bear on the [token](./Token.md) it is about to produce. Each token is considered in relation to the others, so the number of relationships grows far faster than the number of tokens.

The practical consequence is that context does not merely accumulate, it interferes. Adding an irrelevant file does not sit inertly alongside the relevant one; it adds relationships that compete with it. This is the mechanism behind [attention budget](./Attention%20budget.md) and the reason a fuller window is a duller one.

_Usage:_

"Adding files can't hurt."

"It can. Every one of them competes for attention with the file that matters."
