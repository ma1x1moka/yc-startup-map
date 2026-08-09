---
description: A model harnessed with tools, a system prompt and a context window, taking turns with a user. The model in motion.
---

What separates an agent from a chat interface is the loop. The [model](./Model.md) can call a [tool](./Tool.md), the [harness](./Harness.md) executes it and feeds the result back, and the model decides what to do next — repeatedly, without a human between each step. That loop is what lets it read a file, run tests, see a failure and try again.

An agent is therefore a composition, not a product: this model, these tools, this [system prompt](./System%20prompt.md), this [environment](./Environment.md). Changing any one of them changes what the agent is capable of, which is why the same underlying model performs so differently across setups.

_Usage:_

"The agent can't run our tests."

"Then it has no tool for it — that's a harness gap, not a model limitation."
