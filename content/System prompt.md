---
description: Standing instructions placed at the front of the context, setting the agent's role, constraints and available tools.
---

It sits at the start of every request and is therefore the most durable thing in the [context](./Context.md) — the last text still present after everything else has been compacted away. That position also makes it the anchor of the [prefix cache](./Prefix%20cache.md), which is why editing it mid-[session](./Session.md) is expensive.

Its influence is real but bounded. Standing instructions compete with everything that has accumulated since, and in a long session recent [tool](./Tool.md) output can drown out a rule stated at the top. Instructions that must survive belong somewhere the [harness](./Harness.md) re-injects, not stated once and hoped for.

_Usage:_

"The style rule is in the system prompt, why is it ignoring it?"

"It's sixty thousand tokens back now. Restate it or move it somewhere that gets re-injected."
