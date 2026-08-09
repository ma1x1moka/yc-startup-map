---
description: Whatever serves a model for inference. Usually a remote API, but a local runtime counts too.
---

The provider owns the machinery: the [parameters](./Parameters.md) sit on its hardware, and every request is your [harness](./Harness.md) shipping [tokens](./Token.md) over a network and receiving predictions back. Running a [model](./Model.md) locally makes you your own provider, with the same role and different limits.

A whole category of problems lives here and gets misattributed elsewhere. Rate limits, degraded capacity, regional outages and sudden latency spikes are provider conditions, not model failures and not bugs in your setup. When an [agent](./Agent.md) stalls mid-[session](./Session.md) or errors on every [turn](./Turn.md), the provider's status page is the cheapest thing to check first.

_Usage:_

"Every turn is erroring out — did we break the config?"

"Check the provider status page before touching anything."
