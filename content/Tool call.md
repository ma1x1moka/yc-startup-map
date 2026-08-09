---
description: The model emitting a request to use a tool — name plus arguments — and stopping so the harness can run it.
---

The sequence is strict. The [model](./Model.md) produces a structured call and yields. The [harness](./Harness.md) validates and executes it. The result is appended to the [context](./Context.md). The model runs again with that result visible. Nothing happens between those steps that the model controls.

The distinction matters when debugging. A model can describe running a command in prose without ever emitting a call — it looks like work happened and nothing did. Reading the transcript for actual calls, rather than trusting the narration, is how you tell the difference.

_Usage:_

"It said it ran the migration."

"Saying isn't calling. Check the transcript for an actual tool call."
