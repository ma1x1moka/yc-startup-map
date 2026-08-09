---
description: A working pattern where you start a session and let the agent run unattended. Away from keyboard.
---

AFK trades supervision for throughput. It only works when the [agent](./Agent.md) can tell for itself whether it is succeeding, which means [automated checks](./Automated%20check.md) are not optional — without them an unattended agent will confidently produce an hour of broken work.

The safety story rests on the [sandbox](./Sandbox.md) rather than on prompts nobody is present to answer. Strong isolation, good checks and a well-scoped task are what make leaving reasonable; permissive settings on an unsandboxed machine are what make it reckless.

_Usage:_

"I'll let it run through lunch."

"Only if the tests actually gate it. Otherwise you'll come back to an hour of nonsense."
