/**
 * A timer that runs only while the thing it is drawing for is on the page and the page itself is
 * not hidden: a tab nobody is looking at is not worth one, and a browser throttles it anyway.
 *
 * It is what `Screen.svelte`'s little canvases over the game's screen animate on, and what debug
 * mode's reading of the machine's clock moves on. The returned function stops it, which is what a
 * Svelte effect gives back.
 */
export function whileShowing(showing: boolean, ms: number, step: () => void): () => void {
  let timer: ReturnType<typeof setInterval> | null = null;
  const stop = (): void => {
    if (timer !== null) clearInterval(timer);
    timer = null;
  };
  const follow = (): void => {
    stop();
    if (document.hidden || !showing) return;
    timer = setInterval(step, ms);
  };
  follow();
  document.addEventListener('visibilitychange', follow);
  return () => {
    stop();
    document.removeEventListener('visibilitychange', follow);
  };
}
