---
description: Input tokens the provider served from its prefix cache, billed at a steep discount.
---

These show up as a separate line on usage reports, and the ratio of cached to uncached input is one of the fastest health checks available for a long [session](./Session.md). A high cache hit rate means the [harness](./Harness.md) is keeping the front of the [context](./Context.md) stable.

A sudden collapse in that ratio is a signal worth chasing. It usually means something now varies early in the context, or that [compaction](./Compaction.md) rewrote history and invalidated everything downstream of the edit.

_Usage:_

"Cache hits dropped to near zero this afternoon."

"Something's mutating the prefix — check what we added to the system prompt."
