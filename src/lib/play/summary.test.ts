import { describe, expect, it } from 'vitest';
import type { JournalEvent } from '../game/journal-events';
import type { JournalEntry } from './journal';
import { RUN_GAMES } from './run';
import { summarizeJournal, summarySections, SUMMARY_HEADINGS, type RunSummary, type SummaryNames } from './summary';

/**
 * What a run comes to, folded from its journal. The entries here are written by hand rather than
 * played, so that what each total is made of is in the test that reads it.
 */

/** Each game's own words for its clock, its dungeons and its money, which is what `RUN_GAMES`
 *  lends the summary. */
const NAMES = RUN_GAMES.unforgiven;
const MORAFFS_WORLD = RUN_GAMES.moraffsWorld;
const MORAFFS_REVENGE = RUN_GAMES.revenge;

/** An entry for one event, on the floor and in the module a test says. */
function wrote(event: JournalEvent, floor = 1, module = 0): JournalEntry {
  return { at: 0, floor, module, text: '', event };
}

/** Every line of every section, for a test that does not care which section a line is in. */
function linesOf(summary: RunSummary, names: SummaryNames = NAMES): string[] {
  return summarySections(summary, names).flatMap((section) => section.lines);
}

/** The lines of one section, and none when the section was left out. */
function sectionOf(summary: RunSummary, heading: string, names: SummaryNames = NAMES): string[] {
  return summarySections(summary, names).find((section) => section.heading === heading)?.lines ?? [];
}

/** A monster as the events name one. */
const GHOUL = { type: 4, level: 46, name: 'GHOUL' };
const ORC = { type: 5, level: 12, name: 'ORC' };
/** A Shadow boss, which every section stocks in row 22. */
const SHADOW = { type: 22, level: 60, name: 'SHADOW OGEROTH' };

/** EXPLOSION, the first spell of the wizard list's level 7 line. The game has no Fireball. */
const EXPLOSION = { type: 2, level: 6, slot: 0 };

describe('what a run came to', () => {
  it('counts the steps and takes the actions and the clock from the run itself', () => {
    const summary = summarizeJournal(
      [wrote({ kind: 'stepped', dir: 0 }), wrote({ kind: 'stepped', dir: 1 })],
      { actions: 812, time: 4000 },
    );
    expect(summary.travel).toMatchObject({ steps: 2 });
    expect(summary).toMatchObject({ actions: 812, time: 4000 });
    expect(linesOf(summary)).toContain('Took 2 steps');
    expect(linesOf(summary)).toContain('Spent 812 actions and 4,000 seconds');
  });

  it('adds the experience the kills were worth and takes off what a drainer drained', () => {
    const summary = summarizeJournal(
      [
        wrote({ kind: 'killed', monster: GHOUL, experience: 40000 }),
        wrote({ kind: 'experienceDrained', experience: 30, monster: GHOUL }),
      ],
      { actions: 1, time: 1 },
    );
    expect(summary).toMatchObject({ experience: 40000, experienceLost: 30 });
    expect(linesOf(summary)).toContain('Gained 40,000 experience');
    expect(linesOf(summary)).toContain('Lost 30 experience to drainers');
  });

  it('rounds the fraction off an experience total rather than printing it', () => {
    const summary = summarizeJournal(
      [wrote({ kind: 'killed', monster: GHOUL, experience: 1536575526051.7744 })],
      { actions: 1, time: 1 },
    );
    expect(linesOf(summary)).toContain('Gained 1,536,575,526,052 experience');
  });

  it('counts the levels gained and the levels lost', () => {
    const summary = summarizeJournal(
      [
        wrote({ kind: 'levelGained', level: 6, from: 1 }),
        wrote({ kind: 'levelLost', levels: 2, level: 4, monster: GHOUL }),
      ],
      { actions: 1, time: 1 },
    );
    expect(summary).toMatchObject({ levelsGained: 5, levelsLost: 2 });
    expect(linesOf(summary)).toContain('Gained 5 levels, lost 2');
  });

  it('takes the deepest floor and the furthest module from where the entries were written', () => {
    const summary = summarizeJournal(
      [
        wrote({ kind: 'stepped', dir: 0 }, 12, 0),
        wrote({ kind: 'stepped', dir: 0 }, 47, 2),
        wrote({ kind: 'stepped', dir: 0 }, 3, 2),
      ],
      { actions: 3, time: 3 },
    );
    expect(summary).toMatchObject({ deepestFloor: 47, furthestDungeon: 2 });
    expect(linesOf(summary)).toContain('Reached floor 47 of Module III');
  });

  it('adds the money found and the money spent, a building at a time', () => {
    const summary = summarizeJournal(
      [
        wrote({ kind: 'found', find: { what: 'money', amount: 341880 } }),
        wrote({ kind: 'coinsSpent', amount: 300, on: 'MACE', where: 'STORE' }),
        wrote({ kind: 'coinsSpent', amount: 900, on: 'CHAIN', where: 'STORE' }),
        wrote({ kind: 'coinsSpent', amount: 11, on: 'A ROOM', where: 'HOLE' }),
      ],
      { actions: 3, time: 3 },
    );
    expect(summary.moneyFound).toBe(341880);
    expect(summary.spent).toEqual([
      { where: 'STORE', amount: 1200 },
      { where: 'HOLE', amount: 11 },
    ]);
    expect(sectionOf(summary, SUMMARY_HEADINGS.money)).toEqual([
      'Found 341,880 Greater-American Dollars',
      'Spent 1,200 rubles at the STORE',
      "Spent 11 rubles at the HOLE, Module I's inn",
    ]);
  });

  it('counts the wands and scrolls that were made, by the spell each was made for', () => {
    const summary = summarizeJournal(
      [
        wrote({ kind: 'wandMade', spell: EXPLOSION, charges: 5 }),
        wrote({ kind: 'wandMade', spell: EXPLOSION, charges: 5 }),
        wrote({ kind: 'wandMade', spell: EXPLOSION, charges: 5 }),
        wrote({ kind: 'scrollWritten', spell: EXPLOSION }),
      ],
      { actions: 4, time: 4 },
    );
    expect(summary.made).toEqual([
      { what: 'wand', spell: 'EXPLOSION', count: 3 },
      { what: 'scroll', spell: 'EXPLOSION', count: 1 },
    ]);
    expect(sectionOf(summary, SUMMARY_HEADINGS.made)).toEqual([
      'Made 3 wands of EXPLOSION',
      'Wrote 1 scroll of EXPLOSION',
    ]);
  });

  it('counts every cast, and separately the charges and items the casting spent', () => {
    const cast = (source: 'spellPoints' | 'wand'): JournalEntry =>
      wrote({
        kind: 'cast',
        spell: { game: 'unforgiven', type: 2, level: 6, slot: 0, source, name: 'EXPLOSION' },
      });
    const summary = summarizeJournal(
      [
        cast('wand'),
        cast('wand'),
        cast('spellPoints'),
        wrote({ kind: 'itemUsed', item: 'POTION OF HEALING' }),
      ],
      { actions: 4, time: 4 },
    );
    expect(summary.used).toEqual([
      { what: 'charge', name: 'EXPLOSION', count: 2 },
      { what: 'item', name: 'POTION OF HEALING', count: 1 },
    ]);
    expect(sectionOf(summary, SUMMARY_HEADINGS.casts)).toEqual([
      'Cast EXPLOSION 3 times: 2 from wand charges and 1 out of your own head',
    ]);
    expect(sectionOf(summary, SUMMARY_HEADINGS.used)).toEqual(['Used 2 charges of EXPLOSION']);
    expect(sectionOf(summary, SUMMARY_HEADINGS.items)).toEqual(['Used the POTION OF HEALING 1 time']);
  });

  it('says a spell cast out of one place was all cast out of it', () => {
    const summary = summarizeJournal(
      [
        wrote({
          kind: 'cast',
          spell: { game: 'unforgiven', type: 2, level: 6, slot: 0, source: 'wand', name: 'EXPLOSION' },
        }),
        wrote({
          kind: 'cast',
          spell: { game: 'unforgiven', type: 2, level: 6, slot: 0, source: 'wand', name: 'EXPLOSION' },
        }),
      ],
      { actions: 2, time: 2 },
    );
    expect(sectionOf(summary, SUMMARY_HEADINGS.casts)).toEqual([
      'Cast EXPLOSION 2 times, all from wand charges',
    ]);
  });

  it('lists what the dungeon dropped, most of first', () => {
    const summary = summarizeJournal(
      [
        wrote({ kind: 'found', find: { what: 'wand', spell: EXPLOSION, charges: 12 } }),
        wrote({ kind: 'found', find: { what: 'wand', spell: EXPLOSION, charges: 8 } }),
        wrote({ kind: 'found', find: { what: 'spellbook', spell: EXPLOSION } }),
        wrote({ kind: 'found', find: { what: 'weapon', item: 'LONG SWORD' } }),
        wrote({ kind: 'found', find: { what: 'key', key: 100 } }),
      ],
      { actions: 5, time: 5 },
    );
    expect(sectionOf(summary, SUMMARY_HEADINGS.drops)).toEqual([
      'Found 2 wands of EXPLOSION with 20 charges',
      'Found 1 spellbook of EXPLOSION',
      'Found 1 LONG SWORD',
      'Found 1 trap door key to floor 100',
    ]);
  });

  it('counts every way the character got around', () => {
    const summary = summarizeJournal(
      [
        wrote({ kind: 'stepped', dir: 0 }),
        wrote({ kind: 'waited' }),
        wrote({ kind: 'dug', outcome: 'hole', to: 5 }),
        wrote({ kind: 'dug', outcome: 'interrupted' }),
        wrote({ kind: 'ladderTaken', to: 9 }, 8),
        wrote({ kind: 'ladderTaken', to: 7 }, 8),
        wrote({ kind: 'trapdoorTaken', from: { x: 3, y: 4 }, to: 50 }),
        wrote({ kind: 'trapdoorTaken', from: { x: 3, y: 4 }, to: 50 }),
        wrote({ kind: 'trapdoorTaken', from: { x: 9, y: 9 }, to: 100 }),
      ],
      { actions: 9, time: 9 },
    );
    expect(sectionOf(summary, SUMMARY_HEADINGS.travel)).toEqual([
      'Stood still 1 time',
      'Dug 1 hole and had 1 dig interrupted',
      'Climbed 1 ladder down and climbed 1 ladder up',
      'Dropped through 3 trap doors: 2 to floor 50 and 1 to floor 100',
    ]);
  });

  it('keeps an account of the fighting for each kind of monster', () => {
    const summary = summarizeJournal(
      [
        wrote({ kind: 'met', monster: GHOUL, slot: 3 }),
        wrote({ kind: 'swung', weapon: 'LONG SWORD', monster: GHOUL, damage: 31 }),
        wrote({ kind: 'swung', weapon: 'LONG SWORD', monster: GHOUL, damage: 0 }),
        wrote({ kind: 'hit', monster: GHOUL, damage: 16, breath: null }),
        wrote({ kind: 'hit', monster: GHOUL, damage: 0, breath: null }),
        wrote({ kind: 'killed', monster: GHOUL, experience: 341880 }),
        wrote({ kind: 'met', monster: ORC, slot: 7 }),
      ],
      { actions: 7, time: 7 },
    );
    expect(summary.monsters).toEqual([
      { name: 'GHOUL', fights: 1, passed: 0, swings: 2, hits: 1, damageDealt: 31, damageTaken: 16, blows: 1, kills: 1 },
      { name: 'ORC', fights: 0, passed: 1, swings: 0, hits: 0, damageDealt: 0, damageTaken: 0, blows: 0, kills: 0 },
    ]);
    expect(sectionOf(summary, SUMMARY_HEADINGS.monsters)).toEqual([
      'Fought 1 GHOUL: swung 2 times and landed 1, dealt 31, took 16 from them, killed 1',
      'Passed 1 ORC without fighting',
    ]);
  });

  it('totals the fighting over every monster, with the spell damage called out', () => {
    const summary = summarizeJournal(
      [
        wrote({ kind: 'met', monster: GHOUL, slot: 3 }),
        wrote({ kind: 'swung', weapon: 'LONG SWORD', monster: GHOUL, damage: 31 }),
        wrote({ kind: 'spellDamaged', monster: GHOUL, damage: 4000 }),
        wrote({ kind: 'hit', monster: GHOUL, damage: 16, breath: null }),
        wrote({ kind: 'killed', monster: GHOUL, experience: 10 }),
      ],
      { actions: 5, time: 5 },
    );
    expect(summary.spellDamage).toBe(4000);
    expect(linesOf(summary)).toContain('Fought 1 monster and killed 1');
    expect(linesOf(summary)).toContain(
      'Swung 1 time and landed 1, for 4,031, 4,000 of it from spells; took 16 from them',
    );
  });

  it('counts the Shadows killed and the deepest floor one died on', () => {
    const summary = summarizeJournal(
      [
        wrote({ kind: 'killed', monster: SHADOW, experience: 900 }, 5),
        wrote({ kind: 'killed', monster: SHADOW, experience: 900 }, 40),
        wrote({ kind: 'killed', monster: GHOUL, experience: 12 }, 90),
      ],
      { actions: 3, time: 3 },
    );
    expect(summary).toMatchObject({ shadowsKilled: 2, deepestShadowFloor: 40 });
    expect(linesOf(summary)).toContain('Killed 2 Shadows, the deepest on floor 40');
  });

  it('counts the poisonings, the diseases and the characteristics moved', () => {
    const summary = summarizeJournal(
      [
        wrote({ kind: 'afflicted', what: 'poison', monster: GHOUL }),
        wrote({ kind: 'afflicted', what: 'poison', monster: GHOUL }),
        wrote({ kind: 'afflicted', what: 'disease', monster: GHOUL }),
        wrote({ kind: 'statChanged', stat: 'STRENGTH', by: -1, monster: GHOUL }),
        wrote({ kind: 'statChanged', stat: 'LUCK', by: 1, monster: GHOUL }),
      ],
      { actions: 5, time: 5 },
    );
    expect(summary).toMatchObject({ poisonings: 2, diseases: 1, statsDrained: 1, statsRaised: 1 });
    expect(linesOf(summary)).toContain('Was poisoned 2 times and caught 1 disease');
    expect(linesOf(summary)).toContain('Lost 1 point of the six characteristics and gained 1 point');
  });

  it('counts a monster met and left without a blow as met rather than fought', () => {
    const summary = summarizeJournal(
      [
        wrote({ kind: 'met', monster: GHOUL, slot: 3 }),
        wrote({ kind: 'met', monster: ORC, slot: 7 }),
        wrote({ kind: 'met', monster: GHOUL, slot: 3 }),
        wrote({ kind: 'swung', weapon: 'LONG SWORD', monster: GHOUL, damage: 0 }),
      ],
      { actions: 4, time: 4 },
    );
    expect(summary.monsters).toMatchObject([
      { name: 'GHOUL', fights: 1, passed: 1 },
      { name: 'ORC', fights: 0, passed: 1 },
    ]);
    const lines = linesOf(summary);
    expect(lines).toContain('Passed 1 GHOUL and 1 ORC without fighting');
    expect(lines).toContain('Fought 1 monster and killed 0, and met 2 more without fighting');
    expect(lines.some((line) => line.startsWith('Fought 1 ORC'))).toBe(false);
  });

  it('counts a fight for a monster that only landed a blow of its own', () => {
    const summary = summarizeJournal(
      [
        wrote({ kind: 'met', monster: GHOUL, slot: 3 }),
        wrote({ kind: 'hit', monster: GHOUL, damage: 16, breath: null }),
      ],
      { actions: 2, time: 2 },
    );
    expect(summary.monsters).toMatchObject([{ name: 'GHOUL', fights: 1, passed: 0 }]);
  });

  it('counts one fight for a monster walked away from and come back to', () => {
    const summary = summarizeJournal(
      [
        wrote({ kind: 'met', monster: GHOUL, slot: 3 }),
        wrote({ kind: 'swung', weapon: 'LONG SWORD', monster: GHOUL, damage: 4 }),
        wrote({ kind: 'met', monster: GHOUL, slot: 3 }),
        wrote({ kind: 'swung', weapon: 'LONG SWORD', monster: GHOUL, damage: 4 }),
      ],
      { actions: 4, time: 4 },
    );
    expect(summary.monsters[0].fights).toBe(1);
  });

  it('counts a fight of its own for another monster met in between', () => {
    const summary = summarizeJournal(
      [
        wrote({ kind: 'met', monster: GHOUL, slot: 3 }),
        wrote({ kind: 'swung', weapon: 'LONG SWORD', monster: GHOUL, damage: 4 }),
        wrote({ kind: 'met', monster: ORC, slot: 7 }),
        wrote({ kind: 'met', monster: GHOUL, slot: 3 }),
        wrote({ kind: 'swung', weapon: 'LONG SWORD', monster: GHOUL, damage: 4 }),
      ],
      { actions: 5, time: 5 },
    );
    expect(summary.monsters[0].fights).toBe(2);
  });

  it('says where a death happened and what was standing over the character', () => {
    const summary = summarizeJournal(
      [wrote({ kind: 'died', monster: GHOUL, floor: 7, dungeon: 2 })],
      { actions: 1, time: 1 },
    );
    expect(summary.deaths).toEqual([{ floor: 7, dungeon: 2, monster: GHOUL }]);
    expect(linesOf(summary)).toContain('Died on floor 7 of Module III, killed by a Level 46 GHOUL');
  });

  it('says where a death nothing was standing over happened', () => {
    const summary = summarizeJournal(
      [wrote({ kind: 'died', monster: null, floor: 0, dungeon: 0 })],
      { actions: 1, time: 1 },
    );
    expect(linesOf(summary)).toContain('Died in the town of Module I');
  });

  it("folds a Moraff's World run the same way, in that game's own words", () => {
    const werewolf = { type: 1, level: 12, name: 'WEREWOLF' };
    const summary = summarizeJournal(
      [
        wrote({ kind: 'stepped', dir: 3 }, 12, 7),
        wrote({ kind: 'swung', weapon: 'LONG SWORD', monster: werewolf, damage: 31 }, 12, 7),
        wrote({ kind: 'killed', monster: werewolf, experience: 900 }, 12, 7),
        wrote({ kind: 'pillFound', colour: 'GREEN' }, 12, 7),
        wrote({ kind: 'pillFound', colour: 'GREEN' }, 12, 7),
        wrote({ kind: 'found', find: { what: 'money', amount: 240 } }, 12, 7),
        wrote({ kind: 'coinsSpent', amount: 300, on: 'MACE', where: 'STORE' }, 0, 7),
      ],
      { actions: 40, time: 60 },
    );
    expect(summary).toMatchObject({ experience: 900, moneyFound: 240 });
    expect(summary.travel.steps).toBe(1);
    expect(summary.pills).toEqual([{ colour: 'GREEN', count: 2 }]);
    const lines = linesOf(summary, MORAFFS_WORLD);
    expect(lines).toContain('Spent 40 actions and 60 moves');
    expect(lines).toContain('Reached floor 12 of Dungeon 7');
    expect(lines).toContain('Found 2 green pills');
    expect(lines).toContain('Spent 300 jewels at the STORE');
  });

  it("folds a Moraff's Revenge run the same way, with its breath and its fountain", () => {
    const skeleton = { type: 1, level: 9, name: 'SKELETON' };
    const summary = summarizeJournal(
      [
        wrote({ kind: 'breathed', monster: skeleton, damage: 22 }, 30, 1),
        wrote({ kind: 'breathed', monster: skeleton, damage: 18 }, 30, 1),
        wrote({ kind: 'fountainDrunk', generation: 3 }, 70, 1),
      ],
      { actions: 9, time: 400 },
    );
    expect(summary).toMatchObject({ breaths: 2, breathDamage: 40, fountains: 1 });
    const lines = linesOf(summary, MORAFFS_REVENGE);
    expect(lines).toContain('Spent 9 actions and 400 ticks');
    expect(lines).toContain('Breathed fire 2 times for 40');
    expect(lines).toContain('Drank from the fountain of youth 1 time');
    expect(lines).toContain('Reached floor 70 of Generation 1');
  });

  it("counts a Moraff's Revenge cast, which is paid for out of nothing but spell points", () => {
    const summary = summarizeJournal(
      [
        wrote({
          kind: 'cast',
          spell: { game: 'revenge', set: 'battle', level: 2, number: 4, name: 'FIREBALL' },
        }),
      ],
      { actions: 1, time: 1 },
    );
    expect(sectionOf(summary, SUMMARY_HEADINGS.casts, MORAFFS_REVENGE)).toEqual(['Cast FIREBALL 1 time']);
    expect(sectionOf(summary, SUMMARY_HEADINGS.used, MORAFFS_REVENGE)).toEqual([]);
  });

  it('leaves out a section nothing happened in', () => {
    const summary = summarizeJournal([wrote({ kind: 'stepped', dir: 0 })], { actions: 1, time: 1 });
    const headings = summarySections(summary, NAMES).map((section) => section.heading);
    expect(headings).toEqual([SUMMARY_HEADINGS.run]);
  });

  it('passes over an entry written from one of the kinds a game has of its own', () => {
    const summary = summarizeJournal(
      [{ at: 0, floor: 4, module: 0, text: 'Read the tablet in section 1', event: null }],
      { actions: 1, time: 1 },
    );
    expect(summary).toMatchObject({ deepestFloor: 4, monsters: [] });
    expect(summary.travel.steps).toBe(0);
  });
});
