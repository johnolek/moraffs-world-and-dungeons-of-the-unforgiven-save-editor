import { describe, expect, it } from 'vitest';
import { newGame, type Game } from '../game/port/state';
import { describeEffects } from '../bestiary/monsters';
import { debugMonsterLines, wrapToWidth } from './debug-screen';
import { dropOdds } from './drop-odds';
import { engagedMonster } from './panel';
import { swingRoll } from './sawtooth';
import { AHEAD_VIEW } from './view3d/geometry';

/** A game with one monster standing in slot 3 and the character facing it. */
function facing(): Game {
  const game = newGame({ pc: { level: 6, module: 0, x: 40, y: 50, lev: 20, str: 30, luck: 15 } });
  Object.assign(game.monsters[3], { x: 41, y: 50, hp: 90, type: 0, level: 12 });
  game.engaged = 3;
  game.engagedAhead = 3;
  return game;
}

describe("the monster's numbers over the forward view", () => {
  it('prints nothing when the character faces nothing', () => {
    expect(debugMonsterLines(newGame())).toEqual([]);
  });

  it('prints the level and the hit points the panel prints', () => {
    const game = facing();
    expect(debugMonsterLines(game)[0].text).toBe('LEVEL:12 HP:90');
    expect(engagedMonster(game)!.hp).toBe(90);
  });

  it('prints the chance a swing lands as the panel does, to a tenth of a per cent', () => {
    const game = facing();
    const chance = engagedMonster(game)!.hitChance;
    expect(debugMonsterLines(game)[1].text).toBe(`HIT:${(chance * 100).toFixed(1)}%`);
  });

  it('prints the chance of the swing this very tick would take, for a game on the clock', () => {
    const game = facing();
    // srand(5000) then random(80) is the to-hit roll of a swing made at tick 5000, which is what
    // strike does with the reading it takes. A roll that high beats this monster outright, and
    // one 40 ticks later does not: the chance is the moment's rather than the average.
    const high = swingRoll(5000);
    expect(high).toBeGreaterThan(swingRoll(5040));
    const atTheTop = engagedMonster(game, 5000)!.hitChance;
    const lower = engagedMonster(game, 5040)!.hitChance;
    expect(atTheTop).toBeGreaterThan(lower);
    expect(debugMonsterLines(game, 5000)[1].text).toBe(`HIT:${(atTheTop * 100).toFixed(1)}%`);
    // Without a tick it is the average over all eighty rolls, which is what a game drawing its
    // own numbers has.
    expect(debugMonsterLines(game)[1].text).toBe(`HIT:${(engagedMonster(game)!.hitChance * 100).toFixed(1)}%`);
  });

  it("prints the chance the monster's own attack lands, to a tenth of a per cent", () => {
    const game = facing();
    const chance = engagedMonster(game)!.hitsYouChance;
    expect(chance).toBeGreaterThan(0);
    expect(debugMonsterLines(game)[2].text).toBe(`IT HITS:${(chance * 100).toFixed(1)}%`);
  });

  it('prints what killing it is likely to leave behind, as the kills it takes', () => {
    const game = facing();
    const drops = dropOdds(game);
    expect(drops.weapon.chance).toBeGreaterThan(0);
    expect(debugMonsterLines(game)[3].text).toBe(`DROPS WEAPON: 1 IN ${Math.round(1 / drops.weapon.chance)} KILLS`);
    expect(debugMonsterLines(game)[4].text).toBe(`DROPS ARMOR: 1 IN ${Math.round(1 / drops.armor.chance)} KILLS`);
    expect(debugMonsterLines(game)[5].text).toBe(`DROPS SPECIAL: 1 IN ${Math.round(1 / drops.special.chance)} KILLS`);
  });

  it('says a drop is never coming, and which rule rules it out', () => {
    const game = facing();
    game.pc.weaponsOwned = [1, 1, 1, 1, 1, 1, 1, 1];
    game.highSpeed = true;
    game.pc.armorOwned = [1, 0, 0, 0, 0, 0, 1];
    game.pc.level = 0;
    expect(debugMonsterLines(game)[3].text).toBe('DROPS WEAPON: NEVER (OWNS THEM ALL)');
    expect(debugMonsterLines(game)[4].text).toBe('DROPS ARMOR: NEVER (HIGH SPEED)');
    expect(debugMonsterLines(game)[5].text).toBe('DROPS SPECIAL: NEVER (TOWN FLOOR)');
  });

  it('says a monk is offered nothing at all', () => {
    const game = facing();
    game.pc.cls = 2;
    expect(debugMonsterLines(game).slice(3, 6).map((line) => line.text)).toEqual([
      'DROPS WEAPON: NEVER (MONK)',
      'DROPS ARMOR: NEVER (MONK)',
      'DROPS SPECIAL: NEVER (MONK)',
    ]);
  });

  it('prints what the monster does beyond an ordinary hit, in the bestiary\u2019s words', () => {
    const game = facing();
    // A monster that drains a level and poisons: levelDrain 1 and special 1 in the record.
    Object.assign(game.monsterKinds[0], { levelDrain: 1, statDrain: 0, breath: 0, special: 1 });
    const said = describeEffects({ levelDrain: 1, statDrain: 0, breath: 0, special: 1, isBoss: false });
    expect(said).toEqual(['Drains 1 level when it hits you', 'Poisons you when it hits you']);
    expect(debugMonsterLines(game).map((line) => line.text).slice(6)).toEqual(said);
  });

  it('prints only the numbers for a monster that does nothing but hit', () => {
    const game = facing();
    Object.assign(game.monsterKinds[0], { levelDrain: 0, statDrain: 0, breath: 0, special: 0 });
    expect(debugMonsterLines(game)).toHaveLength(6);
  });

  it('keeps every line inside the forward view, the longest of the drop lines included', () => {
    const longest = facing();
    longest.pc.weaponsOwned = [1, 1, 1, 1, 1, 1, 1, 1];
    for (const line of [...debugMonsterLines(facing()), ...debugMonsterLines(longest)]) {
      expect(line.x).toBeGreaterThan(AHEAD_VIEW.left);
      expect(line.y).toBeGreaterThan(AHEAD_VIEW.top);
      expect(line.y).toBeLessThan(AHEAD_VIEW.bottom);
      // Twenty-five units a character in the game's smallest font, which is what font 0 is.
      expect(line.x + line.text.length * 25).toBeLessThan(AHEAD_VIEW.right);
    }
  });
});

describe('a sentence too long for the line it is printed on', () => {
  it('is broken on the spaces between its words', () => {
    expect(wrapToWidth(['one two three four'], 9)).toEqual(['one two', 'three', 'four']);
  });

  it('is left whole when it fits', () => {
    expect(wrapToWidth(['one two'], 20)).toEqual(['one two']);
  });

  it('lets a single word longer than the line run over rather than cutting it in half', () => {
    expect(wrapToWidth(['a lengthening'], 4)).toEqual(['a', 'lengthening']);
  });

  it('breaks each sentence on its own, so two never share a line', () => {
    expect(wrapToWidth(['one', 'two'], 20)).toEqual(['one', 'two']);
  });
});
