---
description: One round trip from harness to provider. The harness sends the context; the provider returns a single response.
---

This is the unit of work you are billed for and the unit that fails. The [harness](./Harness.md) serialises the entire [context](./Context.md) — [system prompt](./System%20prompt.md), history, [tool](./Tool.md) definitions, [tool results](./Tool%20result.md) — sends it, and gets back one response, which may be prose, a [tool call](./Tool%20call.md), or both.

Crucially the whole context goes over the wire every single time, because the [model](./Model.md) is [stateless](./Stateless.md). A long [session](./Session.md) is not sending just your latest message; it is resending everything, on every [turn](./Turn.md). That is why cost per turn climbs as a session grows, and why prefix caching matters so much.

_Usage:_

"We've barely said anything and the bill jumped."

"Every turn resends the whole context — it's the history that's expensive, not the message."
