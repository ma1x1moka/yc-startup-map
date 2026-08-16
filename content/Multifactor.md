---
description: Zero-trust auth and authorization for AI agents with patented prompt injection defense. $15M raised. YC F25.
---

**Website:** multifactor.com | **Twitter:** @multifactorcom | **LinkedIn:** linkedin.com/company/multifactorcom

Founded by [Vivek Nair](./Vivek%20Nair.md) and [Colin Roberts](./Colin%20Roberts.md). San Francisco. Team of 6. YC partner: Nicolas Dessaigne.

Raised **$15M** — largest funding round in the F25 batch. Vivek Nair turned down substantial VC term sheets to go through YC instead.

Enterprise customers include manufacturing supply chain operators managing **$7.5B+** in assets.

Provides fine-grained, auditable, zero-trust authentication specifically for AI agents: "checkpoint links" that let agents share online accounts without exposing passwords, with patented defense against prompt injection attacks.

When an agent calls an API or executes a database query, existing systems either grant it full user permissions (too broad) or no permissions (useless). Multifactor provides per-operation authorization with audit trails — the security primitive the agentic stack was missing.

Natural stack with [Metorial](./Metorial.md) (agent-to-tool connections) and [Browser Use](./Browser%20Use.md) (browser control) — Metorial routes agents, Multifactor controls what agents are authorized to do, Browser Use executes.

_Usage:_

"Can't I just use OAuth for agent auth?"

"OAuth works for humans following an interactive login flow. Agents run headlessly, often calling thousands of APIs per session. You need per-operation authorization with audit trails, not a token granting broad access for 24 hours."
