---
description: The atomic unit a model reads and writes. Roughly word-sized, but not exactly. Context size, cost and latency are all counted in tokens.
---

Text is converted to tokens by a tokenizer: a fixed vocabulary of fragments, fixed before [training](./Training.md), that splits any input into a sequence of entries. The [model](./Model.md) never sees characters or words — only token IDs going in, and one token at a time coming out.

A useful rule of thumb is that a token averages about three-quarters of an English word, so a thousand tokens is roughly 750 words of prose. Code breaks that estimate. Common keywords encode compactly because they appeared constantly in the tokenizer's source text; hashes, base64 blobs, minified bundles and unusual identifiers had no such exposure and shatter into many tokens each. A short file full of generated strings can eat a surprising share of the window.

Tokens are the unit everything else is denominated in. Price is per token, throughput is tokens per second, and the [context window](./Context%20window.md) is a token count — so the tokenized size of your files, not their line count, decides what fits.

_Avoid:_ "Word". Token boundaries do not line up with word boundaries, and every limit you actually care about is denominated in tokens.

_Usage:_

"That config file is tiny, just include it."

"It's tiny in bytes and huge in tokens — it's mostly generated keys."
