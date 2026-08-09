---
description: Loading only the context needed right now, with pointers to the rest. Borrowed from interface design.
---

Rather than front-loading everything an [agent](./Agent.md) might need, you supply a small index and let it fetch detail on demand. The window stays clean, and material only costs budget when it is actually relevant.

This is the organising principle behind [skills](./Skill.md), [context pointers](./Context%20pointer.md) and on-demand [tool](./Tool.md) definitions. It works because retrieval is cheap and attention is not — a pointer costs a few [tokens](./Token.md), while the document it points to might cost thousands that mostly go unused.

_Usage:_

"Should the style guide go in the system prompt?"

"Point at it. It only needs loading when it's actually writing code."
