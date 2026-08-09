---
description: The tokens the model generates back. Billed at a higher rate than input, because producing them costs more compute.
---

Everything the [model](./Model.md) writes counts: prose you read, code it emits, [tool calls](./Tool%20call.md) it makes, and any extended reasoning it does before answering. That last one catches people out — reasoning [tokens](./Token.md) are billed as output even when the [harness](./Harness.md) hides them, and raising [effort](./Effort.md) spends more of them.

Because output is typically several times the input rate, generation style has real cost consequences. An [agent](./Agent.md) that rewrites entire files instead of emitting targeted edits is burning the expensive token type to accomplish the same change.

_Usage:_

"Why is this so much pricier than reading the codebase was?"

"Reading is input. Writing is output, at roughly five times the rate."
