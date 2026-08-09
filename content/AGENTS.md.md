---
description: A conventional file in a repository holding project-specific instructions for coding agents.
---

It is a place to write down what an [agent](./Agent.md) cannot infer from the code alone: how to run the tests, which package manager is in use, the conventions this codebase actually follows, and the traps that catch newcomers. Harnesses load it automatically, so it applies to every [session](./Session.md) without anyone remembering to mention it.

It works best kept short and factual. Long files compete for attention with the task and go stale quietly — and a stale instruction is worse than a missing one, because the agent follows it confidently.

_Usage:_

"Every session I have to explain the build."

"Put it in AGENTS.md once and stop explaining it."
