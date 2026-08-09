---
description: An agent reviewing another agent's work, often with a different model or system prompt. Non-deterministic: it forms a judgement.
---

Where a check asserts, a review assesses. It can catch things no assertion covers — unclear naming, a missed edge case, an approach that works but will not survive the next change — and it can be wrong in ways a test cannot.

It runs anywhere: pre-merge on a pull request, after the fact across commit history, or mid-[session](./Session.md) as a [subagent](./Subagent.md). What decides the category is what the assertion does, not where it runs — an LLM judging code in CI is automated review, not an [automated check](./Automated%20check.md).

_Usage:_

"CI runs an LLM reviewer, so we're covered."

"That's review, not a check. It has an opinion, not a verdict."
