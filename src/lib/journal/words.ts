/**
 * Every word the run journal shows that is not one of the run's own lines.
 *
 * The lines themselves are the games' (`src/lib/play/journal.ts`) and the summary's are
 * `summarySections` in `src/lib/play/summary.ts`; these are the headings around them, so that
 * changing what the timeline is called is one file wherever it is shown.
 */
export const JOURNAL = {
  summary: 'What the run came to',
  timeline: 'Everything that happened',
  locked: 'The journal opens when the run ends.',
  nothing: 'Nothing has happened in this run yet.',
  expandAll: 'Open every part',
  collapseAll: 'Close every part',
};

/** How far the character walked before something else happened, as that walk's one line. */
export function walkWords(steps: number): string {
  return steps === 1 ? 'Walked a step' : `Walked ${steps} steps`;
}

/** The heading over one stretch of the timeline: where the character was while it happened. The
 *  town is floor 0 of every module. */
export function placeHeading(floor: number, module: number, dungeonName: (dungeon: number) => string): string {
  return `${floor === 0 ? 'The town' : `Floor ${floor}`} of ${dungeonName(module)}`;
}
