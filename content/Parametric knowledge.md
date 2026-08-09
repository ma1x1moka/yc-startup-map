---
description: What the model knows from training, stored in its parameters. Broad, fuzzy, undated and impossible to audit.
---

This is everything the [model](./Model.md) absorbed before it ever met you: language, general programming, the shape of popular libraries, common idioms. It needs no [tokens](./Token.md) in the [context](./Context.md), which makes it free and instantly available.

It is also unreliable in specific ways. It has no timestamp, so the model cannot tell you whether what it knows is current. It blurs similar things together, so two libraries with comparable APIs get conflated. And it fails silently — the model cannot distinguish something it knows well from something it half-remembers.

_Usage:_

"It knows this framework well, right?"

"It knows the version it trained on, and it can't tell you which one that was."
