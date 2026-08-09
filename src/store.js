/* The one piece of shared state.
 *
 * The atlas and the panel both need to know what is focused, hovered, matched
 * by search and which colour mode is on, and either can change any of it —
 * clicking a node, clicking a Connects-to chip, typing in search, pressing an
 * arrow key. Routing that through one observable object keeps the layers from
 * having to know about each other.
 */

export function createStore(initial) {
  let state = { ...initial };
  const subscribers = new Set();

  return {
    get() {
      return state;
    },

    /** Shallow-merge. A patch that changes nothing notifies nobody. */
    set(patch) {
      let changed = false;
      for (const key of Object.keys(patch)) {
        if (!Object.is(state[key], patch[key])) {
          changed = true;
          break;
        }
      }
      if (!changed) return;

      const previous = state;
      state = { ...state, ...patch };
      for (const fn of [...subscribers]) fn(state, previous);
    },

    subscribe(fn) {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
  };
}
