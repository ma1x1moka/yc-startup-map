---
description: Everything the agent can perceive and change: the filesystem, the shell, the network and every tool it has been given.
---

The environment is the boundary of the [agent](./Agent.md)'s world. Inside it, things are real and actionable; outside it, they do not exist as far as the agent is concerned. A missing environment variable, an unreachable service or an absent test command are all environment facts, and they cap what the agent can achieve regardless of how capable the [model](./Model.md) is.

You control how big it is. A [sandbox](./Sandbox.md) shrinks it; adding a [tool](./Tool.md) extends it, bringing a database or an API into reach. How well that environment is arranged for an agent to work in is what [AX](./AX.md) measures.

_Usage:_

"It says the tests pass but they don't."

"Check its environment — I don't think it can actually run them."
