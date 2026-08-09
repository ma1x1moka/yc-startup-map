---
description: The full body of text sent to the model on a request. Everything the model can be said to know in the moment.
---

Context is the assembled payload: [system prompt](./System%20prompt.md), [tool](./Tool.md) definitions, the conversation so far, [tool results](./Tool%20result.md), and any file contents that were pulled in. If a fact is not in the context and not in the [parameters](./Parameters.md), the [model](./Model.md) has no access to it.

Treating context as a curated working set rather than an ever-growing log is the core discipline of agentic coding. What you put in front of the model is the main lever you have on output quality — larger is not better, and relevant beats comprehensive every time.

_Usage:_

"It doesn't know about the new endpoint."

"It isn't in context and it postdates the cutoff — of course it doesn't."
