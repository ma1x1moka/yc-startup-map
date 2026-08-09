---
description: An interface running the full agentic loop — tools, multi-step execution, file edits — rather than answering a single question.
---

The same product often ships several modes: a completion mode that suggests as you type, a chat mode that answers in a side panel, and an [agent](./Agent.md) mode that plans, calls [tools](./Tool.md) and edits files across a whole task. They differ in how much of the [environment](./Environment.md) the [model](./Model.md) can reach and how many steps it takes before returning.

Choosing the mode is choosing a cost and risk profile. Agent mode does far more per instruction, which is exactly the point, and also exactly why it needs a considered permission setup.

_Usage:_

"I asked for a rename and it restructured three files."

"You were in agent mode. It scoped the task itself."
