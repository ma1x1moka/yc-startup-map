/* The palette.
 *
 * Grayscale is the resting state: paper, ink, and the atlas carrying all the
 * meaning through position and size. Colour mode swaps the whole ground for
 * one section's pair, which turns the atlas into a map of *that* section —
 * its terms in the section's ink, everything else sunk toward the paper.
 *
 * Each pair has to survive being the entire background of the screen, which is
 * why the inks are near-white or near-black rather than mid-tones: the panel
 * text sits on paper, but the atlas labels sit on this.
 */

export const PALETTE = {
  paper: "#eaeae8",
  ink: "#1a1a19",

  papers: [
    "#4500B3", // The Model
    "#EB4347", // Sessions, Context Windows & Turns
    "#9DD395", // Tools & Environment
    "#D3C2FE", // Failure Modes
    "#0F7A6B", // Handoffs
    "#FFD23F", // Memory and Steering
    "#2D3DCF", // Patterns of Work
  ],

  inks: [
    "#FFD79E",
    "#FFFFFF",
    "#000000",
    "#000000",
    "#FFFFFF",
    "#000000",
    "#FFFFFF",
  ],
};

/** Wrap, so a content folder with more sections than pairs still renders. */
export const paperFor = (index) => PALETTE.papers[index % PALETTE.papers.length];
export const inkFor = (index) => PALETTE.inks[index % PALETTE.inks.length];
