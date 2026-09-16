import type { Leaderboard } from '../lib/app-state.svelte';
import { shortCommit } from '../lib/commit';
import { GAME_CHOICES } from '../lib/game-choice';
import { actionWords, RUN_GAMES, type RunGame } from '../lib/play/run';
import { summarizeJournal, summarySections, type SummaryNames } from '../lib/play/summary';
import { milestoneLine, readRunLog, verifyRun, type RunVerdict } from '../lib/play/verify';

/**
 * A verdict on a run in the words `verify-run` prints. Nothing here checks anything: `verifyRun`
 * in `src/lib/play/verify.ts` does the checking, and this says what it found.
 */

/** What the command prints, and whether it has anything to complain about. */
export interface RunReport {
  lines: string[];
  /** The run is what it claims to be. Anything else is worth the reader's attention. */
  ok: boolean;
}

/** Check the text of a run log and say what came of it. */
export async function reportOnRun(text: string): Promise<RunReport> {
  const log = readRunLog(text);
  if (log === null) return { lines: ['This file is not a run log this build reads.'], ok: false };
  const verdict = await verifyRun(log);
  return { lines: reportLines(verdict), ok: verdict.status === 'verified' };
}

function reportLines(verdict: RunVerdict): string[] {
  const names = RUN_GAMES[verdict.game];
  const { clockWords, dungeonName } = names;
  const lines = [heading(verdict), verdictWords(verdict)];
  if (verdict.leaderboard !== null) lines.push(boardWords(verdict.leaderboard));
  lines.push('', 'The log claims:');
  if (verdict.sessions > 1) lines.push(field('Sessions', String(verdict.sessions)));
  lines.push(field('Actions', actionWords(verdict.claimed.actions)));
  lines.push(field('Clock', clockWords(verdict.claimed.time)));
  const milestones = verdict.claimed.milestones.map((milestone) => milestoneLine(verdict.game, milestone));
  lines.push(field('Milestones', milestones[0] ?? 'none'));
  for (const milestone of milestones.slice(1)) lines.push(field('', milestone));
  const ending = verdict.ending;
  if (ending !== null) {
    const where = ending.place.floor === 0 ? 'the town' : `floor ${ending.place.floor}`;
    lines.push('', 'The replay ended:');
    lines.push(field('Place', `${where} of ${dungeonName(ending.place.dungeon)}, at ${ending.place.x},${ending.place.y}`));
    lines.push(field('Character', ending.won ? 'won' : ending.alive ? 'alive' : 'dead'));
    lines.push(field('Record', ending.record));
  }
  const played = verdict.engine.played.map(shortCommit).join(', ');
  lines.push('', `Engine: played on ${played}, checked by ${shortCommit(verdict.engine.build)}.`);
  for (const note of verdict.notes) lines.push(`Note: ${note}`);
  lines.push(...summaryOfTheRun(verdict, names));
  return lines;
}

/**
 * What the run came to, folded from the journal the replay wrote. A game whose journal has not
 * been written yet has none, and there is nothing to say.
 */
function summaryOfTheRun(verdict: RunVerdict, names: SummaryNames): string[] {
  const journal = verdict.journal;
  if (journal.length === 0) return [];
  const totals = verdict.replayed ?? verdict.claimed;
  const summary = summarizeJournal(journal, totals);
  const lines: string[] = [];
  for (const section of summarySections(summary, names)) {
    lines.push('', `${section.heading}:`, ...section.lines.map((line) => `  ${line}`));
  }
  return lines;
}

function heading(verdict: RunVerdict): string {
  const played = verdict.mode === null ? '' : `, ${verdict.mode}`;
  return `${verdict.name} — ${gameLabel(verdict.game)}${played}`;
}

/** What the report says about the board a run belongs to, which only a locked character has. */
function boardWords(board: Leaderboard): string {
  return `Leaderboard: the character was rolled for the ${board} board, and every run of it is played that way.`;
}

function verdictWords(verdict: RunVerdict): string {
  if (verdict.status === 'verified') return 'Verified: the replay reached everything the log claims.';
  const said = verdict.status === 'failed' ? 'Failed' : 'Unverifiable';
  return `${said}: ${verdict.reason}`;
}

/** The game as the switch in the site's header names it. */
function gameLabel(game: RunGame): string {
  return GAME_CHOICES.find((choice) => choice.id === game)?.label ?? game;
}

function field(label: string, value: string): string {
  return `  ${label.padEnd(12)}${value}`;
}
