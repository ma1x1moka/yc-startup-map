---
description: Running a trained model to produce output. What happens on every request. Parameters stay fixed throughout.
---

Inference is the read side of the [model](./Model.md). [Tokens](./Token.md) go in, arithmetic runs across the [parameters](./Parameters.md), a probability distribution comes out, one token is sampled, and the loop repeats with that token appended. Nothing is written back — the model ends the request exactly as it started.

Because inference is per-token and sequential, it sets the floor on how fast anything built on the model can move. It is also what you are billed for, which is why cost scales with usage rather than arriving as a flat licence fee.

_Usage:_

"Why is the agent so slow on this file?"

"It's rewriting the whole thing — that's a lot of inference, one token at a time."
