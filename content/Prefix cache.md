---
description: Provider-side storage that lets consecutive requests skip re-processing a shared opening stretch of context, billed at a much lower rate.
---

Because every request resends the whole [context](./Context.md), successive [turns](./Turn.md) in a [session](./Session.md) share a long identical prefix — [system prompt](./System%20prompt.md), [tool](./Tool.md) definitions, the conversation so far. The provider can retain the computed state for that prefix and reuse it, charging a fraction of the normal input rate for the cached portion.

The catch is that caching only works on an exact, unbroken prefix. Change anything early in the context and everything after it must be recomputed at full price. This is why harnesses put stable material at the front and volatile material at the back, and why injecting a timestamp near the top of a system prompt quietly destroys the discount for the entire session.

_Usage:_

"Costs tripled after the system prompt change."

"We put a variable near the top — that's every turn missing the prefix cache."
