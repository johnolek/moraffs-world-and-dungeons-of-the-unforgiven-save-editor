import type { RevMagicDesk } from './desk';
import { REV_FOUR_SECONDS } from './held';
import { REV_WORN, revWears } from './magic';
import { REV_ARMOUR_VALUE, revValue, type RevPc } from './record';
import type { RevGame } from './state';

/** 1000:1938: what a character carrying nothing is told. */
export const REV_NO_TREASURE = 'You have no treasure.';

/** 1000:194D: the question, which keeps the cursor on the row (1000:1950). */
export const REV_DROP_ALL_COINS = 'Do you want to drop all of your coins? ';

const YES_KEYS = ['Y'.charCodeAt(0), 'y'.charCodeAt(0)];
const NO_KEYS = ['N'.charCodeAt(0), 'n'.charCodeAt(0)];

/** 1000:1963 and 1000:19B5: what a character with no treasure on them weighs, which is their
 *  armour and themselves. Magic armour is left out of the sum (1000:1978, the bit of value 32),
 *  so anyone wearing it comes down to the bare hundred and fifty. */
const POUNDS_PER_SUIT = 25;
const POUNDS_OF_CHARACTER = 150;

function revWeightWithNoTreasure(pc: RevPc): number {
  if (revWears(pc, REV_WORN.magicArmour)) return POUNDS_OF_CHARACTER;
  return POUNDS_PER_SUIT * revValue(pc, REV_ARMOUR_VALUE) + POUNDS_OF_CHARACTER;
}

/**
 * 1000:1918: the A key, which throws away every coin the character is carrying.
 *
 * What the treasure weighs is not written down anywhere, so nothing is subtracted: the weight is
 * worked out again from scratch as the armour plus the character, the same sum the bank does on
 * the way in (1000:2325). Weight is what a monster hears a character by (`monsters.ts`), and
 * that is what the key is for — a character too deep to walk their coins back to the bank can
 * still go quiet by dropping them.
 *
 * The question is asked with the monsters' clock running (1000:7DC9), so a monster arriving on
 * the character's square gives up on it and leaves the coins alone. Anything that is neither
 * yes nor no asks again (1000:19EE).
 */
export async function revDropAllTheCoins(game: RevGame, desk: RevMagicDesk): Promise<void> {
  const pc = game.pc;
  for (;;) {
    // 1000:1918 into 1000:3029: the message row is wiped before the line goes on it, which is
    // what keeps a second ask from printing under the first.
    game.said = [];
    if (pc.treasure === 0) {
      game.say(REV_NO_TREASURE);
      // 1000:1941: the doubled wait at 1000:2F35, so four seconds rather than two.
      game.delay(REV_FOUR_SECONDS);
      game.said = [];
      return;
    }
    game.say(REV_DROP_ALL_COINS);
    const key = await desk.poll();
    // 1000:1959: a monster standing on the character ends the question with the line still up.
    if (key === null) return;
    if (YES_KEYS.includes(key)) {
      game.events.push({ kind: 'treasureDropped', amount: pc.treasure });
      pc.treasure = 0;
      pc.weight = revWeightWithNoTreasure(pc);
      // 1000:19C7: the statistics screen, which is where the new weight is read.
      await desk.stats();
      return;
    }
    if (NO_KEYS.includes(key)) {
      game.said = [];
      return;
    }
  }
}
