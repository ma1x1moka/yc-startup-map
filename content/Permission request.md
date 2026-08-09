---
description: The harness pausing to ask before an action runs. The interrupt that keeps a human in the loop.
---

The [harness](./Harness.md) intercepts a [tool call](./Tool%20call.md) it considers consequential, stops, and asks. Nothing executes until you answer, which makes this the last reliable checkpoint before an irreversible action.

Permission requests trade autonomy for attention. Every prompt is an interruption, and a [session](./Session.md) that asks constantly is barely autonomous at all — which is precisely why people widen permissions and then find themselves reviewing damage after the fact. A [sandbox](./Sandbox.md) solves the same problem from the other direction, by limiting blast radius rather than asking.

_Usage:_

"I approved everything without reading — it was asking constantly."

"Then sandbox it instead. Prompts you ignore aren't a safety mechanism."
