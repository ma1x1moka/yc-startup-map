---
description: The parameters themselves. Stateless, and capable of exactly one thing: next-token prediction. Nothing agentic happens at this layer.
---

A model is a large array of numbers plus the arithmetic that runs text through them. Give it a sequence of [tokens](./Token.md), it returns a probability distribution over what token comes next. That is the entire interface. It has no memory between calls, cannot run code, cannot read a file, and does not persist anything you tell it.

Everything that makes a model feel like a collaborator — remembering earlier messages, editing files, running tests — is supplied by the [harness](./Harness.md) wrapped around it. Keeping this boundary straight is the single most clarifying move in this whole vocabulary, because it tells you which layer a given problem lives in. A model that writes good code but keeps forgetting the plan is not a model problem.

_Avoid:_ Using "model" for the whole product you interact with. The chat app, the CLI and the editor plugin are harnesses that call a model.

_Usage:_

"The model lost track of what we decided."

"The model has no track to lose — that's context management, which is the harness's job."
