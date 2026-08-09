---
description: A dial controlling how much reasoning the model does before answering. Higher effort spends more output tokens for a better chance at hard problems.
---

Turning effort up lets the [model](./Model.md) generate an extended internal chain of reasoning before committing to a response. That reasoning is emitted as [tokens](./Token.md) and billed as [output tokens](./Output%20tokens.md) even when the [harness](./Harness.md) never shows them to you, so higher effort costs more and takes longer.

The trade is deliberation against speed and money. Mechanical work — renaming things, applying a known pattern, formatting — gains nothing from a higher setting. Problems where the first plausible approach is often the wrong one are exactly where the extra thinking pays for itself.

_Usage:_

"It keeps picking the wrong approach and then patching around it."

"Raise the effort — it's committing before it's finished thinking."
