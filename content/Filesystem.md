---
description: Disk as the agent's durable memory. The one place where work survives a cleared context.
---

Files outlast [sessions](./Session.md). Everything else — conversation, plans held in the window, decisions reached in discussion — vanishes when the [context](./Context.md) is cleared. This makes the filesystem the natural home for anything that must persist, and the reason [handoff artifacts](./Handoff%20artifact.md) are written to disk rather than summarised in chat.

It also cuts the other way. The [agent](./Agent.md)'s edits are real the moment they are written, whether or not the conversation that produced them still makes sense. [Clearing](./Clearing.md) a confused session does not undo what it already did.

_Usage:_

"Write the plan to a file before we clear."

"Right — if it isn't on disk it doesn't survive."
