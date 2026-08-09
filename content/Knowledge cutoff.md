---
description: The date past which the model saw no training data. Everything after it is invisible unless you supply it.
---

Beyond the cutoff the [model](./Model.md) does not know what it does not know. It will confidently describe the latest release it saw as current, unaware that three major versions have shipped since, and will happily invent details in the shape of what it expects.

The fix is never to ask the model to be more careful; it is to close the gap with [context](./Context.md). Documentation, changelogs and real source pulled into the window [turn](./Turn.md) a guess into a read.

_Usage:_

"It's using the old API."

"That's the one that existed at its cutoff. Paste in the migration guide."
