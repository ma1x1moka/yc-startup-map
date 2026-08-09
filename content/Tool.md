---
description: A capability exposed to the model by the harness, described well enough that the model can decide when to call it.
---

A tool is a name, a description and a parameter schema, sent to the [model](./Model.md) as part of the [context](./Context.md). The model never executes anything — it emits a request to use a tool, and the [harness](./Harness.md) runs the actual code. Reading files, running commands, searching the web and querying a database all arrive this way.

Tools are not free. Every definition occupies context on every request, so a harness with dozens of them spends real budget before the conversation starts. Many harnesses now mitigate this by holding only a pointer to the tool catalogue and loading full definitions on demand.

_Usage:_

"Enable every MCP server we've got."

"That's twenty thousand tokens of definitions on every single turn."
