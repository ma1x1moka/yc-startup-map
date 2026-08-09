---
description: Holding state across turns. The harness is stateful; the model it calls is not.
---

State in an agentic [session](./Session.md) lives in three places, and telling them apart is diagnostic. There is conversation state the [harness](./Harness.md) replays, [filesystem](./Filesystem.md) state that persists on disk regardless of what the [model](./Model.md) remembers, and external state in databases and services that outlives everything.

Confusion here produces a specific bug class: an [agent](./Agent.md) that has lost the thread in conversation but has already changed files on disk. The [context](./Context.md) can be cleared; the side effects cannot.

_Usage:_

"Just clear it and start over."

"The conversation resets. The half-finished migration on disk doesn't."
