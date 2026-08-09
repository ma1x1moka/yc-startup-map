---
description: The model retains nothing between requests. Each one starts from scratch, with no memory of what came before.
---

There is no [session](./Session.md) on the [model](./Model.md)'s side. The apparent continuity of a conversation is an illusion maintained entirely by the [harness](./Harness.md), which replays the full history on every request so the model can infer what has happened from text alone.

Once this lands, a lot of confusing behaviour resolves. The model did not forget your instruction — either the harness stopped sending it, or it is still there but buried under so much other material that it lost the model's attention. Those are different problems with different fixes, and neither is the model choosing to ignore you.

_Usage:_

"I told it that twenty minutes ago."

"It's stateless — either that got compacted away or it's drowning in everything since."
