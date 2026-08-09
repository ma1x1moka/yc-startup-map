---
description: The standing policy for which actions need approval and which run unattended.
---

Modes range from asking about everything through allow-listing categories to running unattended entirely. The right setting is a function of blast radius: a throwaway branch in a container and a machine with production credentials deserve different answers.

The failure pattern is drift. People loosen the mode to escape interruption during a tedious [session](./Session.md) and never tighten it again, so a policy chosen for safe work is still in force during risky work. Coupling a permissive mode to a strong [sandbox](./Sandbox.md) is what makes unattended running defensible.

_Usage:_

"It's on full auto — is that fine?"

"In a disposable container, yes. On your laptop with prod keys, no."
