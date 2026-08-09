---
description: An agent spawned by another agent through a tool call. It runs in its own session and reports back a single result.
---

The value is [context](./Context.md) isolation. A subagent can read fifty files, run a broad search and work through a long investigation in its own window, then return a short conclusion — so the parent pays for the answer rather than the search.

The cost is that everything the subagent saw is gone. It cannot ask a follow-up question, and the parent cannot inspect the reasoning that produced the summary. Subagents suit well-specified work with a compact result, and suit exploratory work where the findings matter poorly.

_Usage:_

"Send a subagent to find every call site."

"Good use — we want the list, not the fifty files it read to build it."
