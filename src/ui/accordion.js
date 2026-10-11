/* Shared accordion markup + toggle — used by the panel's per-card "Heard in
 * the wild" and the About modal's platform FAQ. One open item at a time per
 * `.accordion` group; closed by default. */
import { ICONS, svg } from "./icons.js";

/** @param {{q: string, a: string}[]} pairs plain strings — the caller is
 *  responsible for escaping/inline-rendering q/a before passing them in. */
export function renderAccordion(pairs) {
  return `
    <div class="accordion">
      ${pairs
        .map(
          ({ q, a }) => `
        <div class="accordion-item">
          <button type="button" class="accordion-trigger" data-action="toggle-accordion" aria-expanded="false">
            <span class="accordion-q">${q}</span>
            ${svg(ICONS.chevron, "accordion-chevron")}
          </button>
          <div class="accordion-body">
            <div class="accordion-answer">${a}</div>
          </div>
        </div>`
        )
        .join("")}
    </div>`;
}

/** Call from a delegated click handler once `event.target.closest("[data-action]")`
 *  has already identified `kind === "toggle-accordion"`. */
export function toggleAccordionItem(trigger) {
  const item = trigger.closest(".accordion-item");
  const group = item.closest(".accordion");
  const wasOpen = item.hasAttribute("data-expanded");
  for (const sibling of group.querySelectorAll(".accordion-item[data-expanded]")) {
    sibling.removeAttribute("data-expanded");
    sibling.querySelector(".accordion-trigger").setAttribute("aria-expanded", "false");
  }
  if (!wasOpen) {
    item.setAttribute("data-expanded", "");
    trigger.setAttribute("aria-expanded", "true");
  }
}
