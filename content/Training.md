---
description: The process that sets a model's parameters by running enormous amounts of text through it and adjusting to improve next-token prediction.
---

Training is a search for parameter values that make real text look probable. The [model](./Model.md) is shown a fragment, predicts the next [token](./Token.md), is scored against the actual next token, and its [parameters](./Parameters.md) are nudged to reduce the error. Repeat across a vast corpus and useful structure — syntax, facts, reasoning patterns, code idioms — falls out of the pressure to predict well.

It happens once, in advance, on someone else's hardware, and it is the expensive part. Later stages shape behaviour rather than raw knowledge: instruction tuning and preference training teach the model to be useful and to follow directions. The practical consequence is a hard edge in time — the [knowledge cutoff](./Knowledge%20cutoff.md) — beyond which the model simply has not seen the world.

_Usage:_

"Can we train it on our internal docs?"

"Almost certainly you want retrieval, not training — put the docs in context instead."
