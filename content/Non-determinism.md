---
description: The same input can produce different output. A property of how models sample text and how providers serve requests.
---

Generation samples from a probability distribution rather than always taking the most likely [token](./Token.md), so two identical requests can diverge at any position and then keep diverging. Provider-side factors add more: batching, hardware differences and routing between server pools all perturb results at the margins.

This is why prompt fixes are hard to confirm and why bug reports built on a single run are weak evidence. If a change matters, it should show up across several runs; if a failure only ever happened once, you have not yet established that it is real.

_Usage:_

"I fixed the prompt, it works now."

"Run it five more times — one pass doesn't separate a fix from a lucky sample."
