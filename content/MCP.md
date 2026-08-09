---
description: A standard protocol for exposing tools and data to agents, so a capability written once works across harnesses.
---

[Model](./Model.md) [Context](./Context.md) Protocol replaces bespoke per-[harness](./Harness.md) integrations with a common interface. A server exposes [tools](./Tool.md), resources and prompts; any compatible client can connect and use them. This is what makes it practical to share a database connector or an issue-tracker integration across different [agent](./Agent.md) setups.

The cost is context. Each connected server contributes tool definitions to every request, and connecting everything available is a reliable way to spend a large slice of the window before any work begins. Enable the servers a project actually needs.

_Usage:_

"Why is the baseline context so big on this project?"

"Six MCP servers connected. We use two."
