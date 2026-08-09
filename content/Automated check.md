---
description: A deterministic verification that runs in the environment — tests, type checks, lints, builds, hooks. Pass or fail, no judgement.
---

Checks are the signal an [agent](./Agent.md) can self-correct from without involving anyone. A failing test is unambiguous feedback the agent can act on immediately, which is what [turns](./Turn.md) a long unattended run into something that converges rather than drifts.

They are deterministic by design, and a flaky test is a broken check rather than a softer one — it teaches the agent that failure is noise. Investment here has unusually high leverage, because every check you add is a class of error the agent can catch on its own for the rest of the project's life.

_Usage:_

"Why is it so much better on this repo?"

"Fast tests and strict types. It gets told it's wrong in seconds."
