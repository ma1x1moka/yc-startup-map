/* Search, as a filter on the atlas rather than a list of results.
 *
 * A dropdown would put the answer in a box on top of the map. Writing the
 * matches into the store instead lets the atlas do the answering: matches stay
 * lit and their connections appear, everything else recedes. You see not only
 * which terms matched but how they relate — which is the whole reason the
 * terms are on a graph.
 */

export class Search {
  constructor(root, { graph, store, onSound }) {
    this.store = store;
    this.onSound = onSound ?? (() => {});

    this.openButton = root.querySelector("#search-open");
    this.field = root.querySelector(".search-field");
    this.input = root.querySelector("#search-input");
    this.clearButton = root.querySelector("#search-clear");
    this.count = root.querySelector("#search-count");

    // Lower-cased once. Aliases are searchable so "away from keyboard" finds
    // AFK, which is exactly when you need a dictionary.
    this.haystack = graph.nodes.map((node) => ({
      slug: node.slug,
      text: [node.title, ...(node.aliases ?? []), node.description]
        .join(" ")
        .toLowerCase(),
      title: node.title.toLowerCase(),
    }));

    this.openButton.addEventListener("click", () => this.open());
    this.clearButton.addEventListener("click", () => this.clear());
    this.input.addEventListener("input", () => this.run(this.input.value));
    this.input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        this.input.value ? this.clear() : this.close();
      }
    });
  }

  get isOpen() {
    return !this.field.hidden;
  }

  open() {
    this.field.hidden = false;
    this.openButton.hidden = true;
    this.input.focus();
    this.onSound("open");
  }

  close() {
    this.clear();
    this.field.hidden = true;
    this.openButton.hidden = false;
    this.openButton.focus();
  }

  clear() {
    this.input.value = "";
    this.run("");
    this.input.focus();
  }

  run(query) {
    const trimmed = query.trim().toLowerCase();
    this.clearButton.hidden = !trimmed;

    if (!trimmed) {
      this.count.hidden = true;
      this.store.set({ query: "", matchSlugs: [], searchActive: false });
      return;
    }

    // Title matches first, then anything else that contains the string.
    const matches = this.haystack
      .filter((entry) => entry.text.includes(trimmed))
      .sort((a, b) => {
        const aTitle = a.title.includes(trimmed) ? 0 : 1;
        const bTitle = b.title.includes(trimmed) ? 0 : 1;
        return aTitle - bTitle;
      })
      .map((entry) => entry.slug);

    this.count.hidden = false;
    this.count.textContent =
      matches.length === 1 ? "1 term" : `${matches.length} terms`;

    this.store.set({
      query: trimmed,
      matchSlugs: matches,
      // An empty result would blank the atlas entirely, which reads as broken.
      // Keep everything visible and let the count say there is nothing.
      searchActive: matches.length > 0,
    });
  }
}
