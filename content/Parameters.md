---
description: The numbers inside a model, often in the billions, set during training. Everything the model knows is encoded in them. Also called weights.
---

Parameters are what [training](./Training.md) produces and what [inference](./Inference.md) consumes. They are fixed once training ends: running the [model](./Model.md) does not change them, so nothing you say in a [session](./Session.md) is written back into the model. Two people prompting the same model are reading the same frozen numbers.

Parameter count is a rough proxy for capability and a firm one for cost, since every [token](./Token.md) generated involves arithmetic across all of them. It is a weak predictor on its own, though — training data quality, training duration, and post-training work routinely let a smaller model beat a larger one.

_Usage:_

"Does it learn from our codebase as we go?"

"No. Parameters are frozen after training — anything it knows about our code came in through the context window."
