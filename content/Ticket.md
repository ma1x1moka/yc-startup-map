---
description: A scoped unit of work, sized so one session can finish it inside the smart zone.
---

Tickets impose the boundaries that keep [sessions](./Session.md) healthy. A well-sized one has a clear start, a clear finish and enough [context](./Context.md) in its own description to begin without archaeology — which is the same property that makes it a usable [handoff artifact](./Handoff%20artifact.md).

Sizing is the whole art. Too large and the session degrades before completion; too small and you pay session setup costs repeatedly for trivial changes.

_Usage:_

"This ticket's been open across four sessions."

"Then it isn't a ticket, it's a project. Split it."
