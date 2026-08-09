---
description: Whatever mechanism carries information across sessions — files, notes, a store the harness reads on startup.
---

Since the [model](./Model.md) is [stateless](./Stateless.md) and the window is cleared, persistence has to be built. A memory system is the [harness](./Harness.md)'s answer: a convention for what gets written down and what gets loaded back in at the start of the next [session](./Session.md).

The engineering problem is selection rather than storage. Everything remembered costs [context](./Context.md) on every session that loads it, so an unpruned memory becomes a tax — and eventually carries stale claims that actively mislead.

_Usage:_

"It keeps using the old deploy command."

"It's in the memory file. Memory doesn't expire on its own."
