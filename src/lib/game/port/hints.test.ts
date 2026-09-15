import { describe, expect, it } from 'vitest';
import {
  allHints,
  bossTablet,
  bossWarningHint,
  classTablet,
  giveHint,
  HELP_COLOURS,
  HELP_FILES,
  HELP_TOPICS,
  helpScreen,
  HINT_COUNT,
  hintOnArrival,
  innSignHint,
  innTablet,
  readHelpScreen,
  sectionNumber,
  TABLET_COUNT,
  tabletMessage,
  townTablet,
} from './hints';
import type { Rng } from './rng';
import { FAITHFUL_RULES } from './rules';

/** An Rng that hands back the numbers it is given, in order, and then zeroes. */
function rolls(...values: number[]): Rng {
  let next = 0;
  return { random: () => values[next++] ?? 0 };
}

describe('the hint files', () => {
  it('has the twenty-nine help screens the game folder holds, with no 19.uhp', () => {
    expect(HELP_FILES.length).toBe(29);
    expect(HELP_FILES).not.toContain(19);
    expect(HELP_FILES[HELP_FILES.length - 1]).toBe(29);
  });

  it('reads 138 messages out of UH.BIN and 86 out of UH2.BIN', () => {
    expect(allHints().filter((entry) => entry.file === 'uh.bin').length).toBe(HINT_COUNT);
    expect(allHints().filter((entry) => entry.file === 'uh2.bin').length).toBe(TABLET_COUNT);
  });

  it('gives every message some text', () => {
    for (const entry of allHints()) {
      expect(entry.lines.some((line) => line.text.trim() !== ''), `${entry.file} ${entry.index}`).toBe(true);
    }
  });

  it('gives the first and the last hint of UH.BIN whole', () => {
    expect(giveHint(0)[0]).toBe('A LITTLE SNAKE SAYS:');
    expect(giveHint(0)[7]).toBe('SHADOW LESDIDIAN WARRIOR.');
    expect(giveHint(HINT_COUNT - 1)[2]).toBe('IS THE SHADOW OGEROTH');
  });

  it('gives the first and the last tablet of UH2.BIN whole', () => {
    expect(tabletMessage(0)[1]).toBe('snake says:');
    expect(tabletMessage(TABLET_COUNT - 1)[0]).toBe('If you die, buy this game and your');
  });

  it('keeps the typos', () => {
    expect(giveHint(133)[4]).toBe('EVERYONE WILL APPLUAD!');
    expect(giveHint(128)[1]).toBe('WATCH YOUR STEP CARFULLY');
  });
});

describe('the help screens', () => {
  it('splits a screen into pages and colours every line', () => {
    const pages = readHelpScreen(['yTITLE:', '', 'oA LINE.', 'eX', 'rPAGE TWO.', 'ee', ''].join('\n'));
    expect(pages.length).toBe(2);
    expect(pages[0]).toEqual([
      { colour: HELP_COLOURS.y, text: 'TITLE:' },
      { colour: HELP_COLOURS.y, text: '' },
      { colour: HELP_COLOURS.o, text: 'A LINE.' },
    ]);
    expect(pages[1]).toEqual([{ colour: HELP_COLOURS.r, text: 'PAGE TWO.' }]);
  });

  it('reads the quit screen, which is one page', () => {
    const pages = helpScreen(1);
    expect(pages.length).toBe(1);
    expect(pages[0][0]).toEqual({ colour: HELP_COLOURS.y, text: 'THE QUIT COMMAND:' });
    expect(pages[0][pages[0].length - 1]).toEqual({ colour: HELP_COLOURS.r, text: 'HIT ANY KEY...' });
  });

  it('reads the two pages of the cast spells screen', () => {
    const pages = helpScreen(13);
    expect(pages.length).toBe(2);
    expect(pages[1][0]).toEqual({ colour: HELP_COLOURS.y, text: 'CAST SPELLS MENU:       (PAGE 2)' });
  });

  it('has a menu entry for every help file except 18.uhp', () => {
    const opened = HELP_TOPICS.map((topic) => topic.file).sort((a, b) => a - b);
    expect(opened.length).toBe(28);
    expect(HELP_FILES.filter((file) => !opened.includes(file))).toEqual([18]);
  });
});

describe('which hint arriving on a floor gets', () => {
  it('explains the town the first time module I reaches it', () => {
    expect(hintOnArrival(0, 0, 0, rolls())).toBe(102);
    expect(giveHint(102)[0]).toBe('YOU ARE IN THE TOWN!');
  });

  it('warns about the boss of the section, by the section the floor is in', () => {
    expect(bossWarningHint(0, 5, 0)).toBe(0);
    expect(bossWarningHint(1, 40, 0)).toBe(7);
    expect(bossWarningHint(2, 15, 0)).toBe(126);
    expect(bossWarningHint(4, 100, 0)).toBe(137);
  });

  it('names in its warning the boss the section really has', () => {
    expect(sectionNumber(FAITHFUL_RULES, 2, 15)).toBe(8);
    expect(giveHint(126)[3]).toContain('SHADOW HEAD');
    expect(giveHint(137)[2]).toContain('OGEROTH');
  });

  it('stops warning about a boss that has been killed', () => {
    expect(bossWarningHint(0, 5, 0b0001)).toBeNull();
    expect(bossWarningHint(0, 10, 0b0001)).toBe(1);
    expect(bossWarningHint(0, 20, 0b1000)).toBeNull();
  });

  it('says nothing on a floor with no boss on it', () => {
    expect(bossWarningHint(0, 7, 0)).toBeNull();
  });

  it('otherwise gives one of the eight general hints once in twelve arrivals', () => {
    expect(hintOnArrival(0, 7, 0, rolls(0))).toBeNull();
    expect(hintOnArrival(0, 7, 0, rolls(1, 0))).toBe(8);
    expect(hintOnArrival(0, 7, 0, rolls(1, 7))).toBe(15);
  });
});

describe('what the snake says in town and at the inn', () => {
  it('greets by the deepest floor reached, and says nothing past floor 99', () => {
    expect(townTablet(0)).toBe(0);
    expect(townTablet(3)).toBe(0);
    expect(townTablet(4)).toBe(1);
    expect(townTablet(99)).toBe(9);
    expect(townTablet(100)).toBeNull();
    expect(tabletMessage(0)[2]).toBe("  'Hail novice adventurer! You are");
  });

  it('congratulates by the level gained, and says nothing from level 80', () => {
    expect(innTablet(1)).toBe(10);
    expect(innTablet(2)).toBe(11);
    expect(innTablet(79)).toBe(23);
    expect(innTablet(80)).toBeNull();
    expect(tabletMessage(10)[0]).toBe('A little snake says:');
  });

  it('has a different inn in every module', () => {
    expect(giveHint(innSignHint(0))[0]).toBe('WELCOME TO THE HELL HOLE INN');
    expect(giveHint(innSignHint(4))[0]).toBe('WELCOME TO THE MORAFF INN!');
  });
});

describe('the message the snake brings from the boss', () => {
  it('has three taunts per section in module I and one everywhere else', () => {
    expect(bossTablet(0, 0)).toBe(24);
    expect(bossTablet(0, 2)).toBe(26);
    expect(bossTablet(0, 3)).toBeNull();
    expect(bossTablet(3, 0)).toBe(33);
    expect(bossTablet(4, 0)).toBe(36);
    expect(bossTablet(4, 1)).toBeNull();
    expect(bossTablet(19, 0)).toBe(51);
  });

  it('opens module II with the tablet that welcomes you to it', () => {
    expect(tabletMessage(36)[0]).toBe('Welcome to Module II, future corpse.');
  });
});

describe('the tablet a new character is welcomed with', () => {
  it('has one for each of the seven classes', () => {
    expect(classTablet(0)).toBe(52);
    expect(tabletMessage(classTablet(0))[0]).toBe('Congratulations on your new life,');
    expect(tabletMessage(classTablet(6))[0]).toBe('Hail, young mage! You have chosen to');
  });
});
