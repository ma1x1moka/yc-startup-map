---
description: A working pattern where the user accepts the agent's code without reading it. The diff is treated as opaque.
---

Judgement moves from the code to its behaviour: does the thing work when you try it. For [prototyping](./Prototyping.md), throwaway scripts and exploratory work that is a perfectly rational trade — reading code you intend to discard is waste.

It stops being rational the moment the code becomes load-bearing, because nobody involved understands it. The characteristic failure is not a bug but a codebase that has to be maintained and cannot be, since the only reader was an [agent](./Agent.md) whose [session](./Session.md) retained nothing.

The distinction worth holding is between skipping [human review](./Human%20review.md) and not having any review at all. [Automated checks](./Automated%20check.md) still run on code nobody read, and they are the only thing standing between a vibe-coded change and production.

_Usage:_

"I vibe-coded the whole admin panel."

"Fine until someone has to change it. Nobody's read it."
