---
description: One exchange in a session: your message, and everything the agent does before handing control back.
---

A single turn can contain many requests. The [model](./Model.md) emits a [tool call](./Tool%20call.md), the [harness](./Harness.md) runs it and returns the result, the model calls another tool, and so on — each round trip billed separately — until it produces a response with no further calls and control returns to you.

This is why a turn that looked like one question can cost a great deal, and why watching the [tool](./Tool.md) calls inside a turn tells you far more about what went wrong than reading the final summary.

_Usage:_

"One question, and it burned a fortune."

"It made thirty tool calls inside that turn. Each one was a full request."
