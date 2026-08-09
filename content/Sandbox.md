---
description: An isolated environment the agent runs inside — a container, a VM, an ephemeral filesystem or a restricted shell.
---

A sandbox limits blast radius. Even if the [agent](./Agent.md) runs something destructive, or acts on malicious content it fetched, the damage is contained by the boundary rather than prevented by a question. That containment is what makes running unattended a reasonable thing to do.

Sandboxes and permission prompts attack the same risk from opposite ends. Permissions ask before an action runs and need you present to answer; a sandbox constrains what any action can reach whether or not anyone is watching. One spends attention, the other spends infrastructure — and the stronger the isolation, the fewer questions need asking.

_Usage:_

"Can I leave it running overnight?"

"In a sandbox with no credentials, sure. Otherwise absolutely not."
