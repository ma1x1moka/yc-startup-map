---
description: Quality declining as context fills. Instructions get missed, earlier decisions get dropped, mistakes get repeated.
---

The signs are consistent: a constraint stated early stops being honoured, a bug already fixed reappears, the [agent](./Agent.md) re-reads files it read an hour ago, and the same wrong approach comes back after being ruled out. None of these are the [model](./Model.md) getting worse; they are the same model working through a saturated window.

This is a strong argument for treating degradation as a scheduled event rather than a surprise. Handing off before quality falls is cheap; noticing after an hour of subtly wrong work is not.

_Usage:_

"It just reintroduced the bug we fixed this morning."

"Textbook degradation. Hand off now rather than fighting it."
