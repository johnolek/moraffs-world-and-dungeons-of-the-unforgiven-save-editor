/**
 * Whether a canvas is on the page smaller than the picture it holds, counted in the display's own
 * pixels rather than CSS ones: a display that draws two of its pixels to the CSS pixel still shows
 * every pixel of a picture laid out at half the picture's width.
 *
 * It matters because a picture shrunk with `image-rendering: pixelated` is shrunk by throwing whole
 * rows and columns of it away, and a line one pixel wide that lands on a thrown-away row is gone
 * altogether. A screen shown below its own size can smooth the picture instead, which leaves that
 * line faint but there.
 *
 * It says no until the observer has had its first say, which is the frame after the canvas is
 * mounted.
 */
export function drawnSmaller(canvas: () => HTMLCanvasElement | null | undefined): { readonly smaller: boolean } {
  let smaller = $state(false);
  $effect(() => {
    const target = canvas();
    if (!target) return;
    const observer = new ResizeObserver(([entry]) => {
      smaller = Math.round(entry.contentRect.width * window.devicePixelRatio) < target.width;
    });
    observer.observe(target);
    return () => observer.disconnect();
  });
  return {
    get smaller() {
      return smaller;
    },
  };
}
