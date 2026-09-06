/* Duplicate-word highlighting for manual review of draft cards.
 *
 * Operates on already-rendered text nodes only — never on raw HTML strings —
 * so it can never open a path from content to markup, matching markdown.js's
 * own escaping discipline. A `<mark>` is inserted via createElement/textContent,
 * not innerHTML.
 */

const DUPLICATE_WORD = /\b(\w+)([ \t]+)\1\b/gi;

/**
 * Wraps immediately-repeated words ("the the", "engineer engineer") in
 * `<mark class="dup-word">` within `root`. Returns how many it found.
 */
export function highlightDuplicateWords(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  let node;
  while ((node = walker.nextNode())) {
    if (node.parentElement?.closest("mark.dup-word")) continue;
    textNodes.push(node);
  }

  let count = 0;
  for (const textNode of textNodes) {
    const text = textNode.nodeValue;
    DUPLICATE_WORD.lastIndex = 0;
    if (!DUPLICATE_WORD.test(text)) continue;
    DUPLICATE_WORD.lastIndex = 0;

    const frag = document.createDocumentFragment();
    let lastIndex = 0;
    let match;
    while ((match = DUPLICATE_WORD.exec(text))) {
      frag.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
      const mark = document.createElement("mark");
      mark.className = "dup-word";
      mark.title = "Repeated word — check whether this is intentional.";
      mark.textContent = match[0];
      frag.appendChild(mark);
      lastIndex = DUPLICATE_WORD.lastIndex;
      count++;
    }
    frag.appendChild(document.createTextNode(text.slice(lastIndex)));
    textNode.parentNode.replaceChild(frag, textNode);
  }
  return count;
}
