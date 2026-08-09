---
description: Confident, fluent output that is simply untrue — an invented function, a misremembered flag, a plausible citation to nothing.
---

This is not a malfunction bolted onto an otherwise truthful system. [Next-token prediction](./Next-token%20prediction.md) optimises for likely, never for true, and a fabricated API that follows the naming conventions of a real library is extremely likely text. Fluency and accuracy are separate axes, and the [model](./Model.md) gives you no signal to distinguish them.

Hallucination clusters where the model's knowledge is thinnest: recent releases past the [knowledge cutoff](./Knowledge%20cutoff.md), small or internal libraries, exact version numbers, and precise quotations. The countermeasure is structural rather than conversational — put the real material in [context](./Context.md), and let [automated checks](./Automated%20check.md) catch what remains.

_Usage:_

"It used a method that doesn't exist."

"Classic hallucination. Give it the actual docs rather than asking it to be sure."
