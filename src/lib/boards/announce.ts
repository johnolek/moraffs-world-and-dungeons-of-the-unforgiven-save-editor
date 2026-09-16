import { actionWords } from '../play/run';
import { dungeonName, gameName } from './words';
// The server sends fields and no sentence, so this is the one place either page turns one of its
// rows into words. The row is a type and nothing else; the finds are a table of names, which is
// all that `server/boards.ts` is safe to import a value from.
import type { Announcement } from '../../../server/announcing';
import { ANNOUNCED_FINDS } from '../../../server/boards';

/**
 * What an announcement says.
 *
 * Every sentence names the character and, in brackets, the player: an announcement is read on its
 * own in a feed of other people's runs, so it has to say whose it is without anything around it.
 */
export function announcementWords(announcement: Announcement): string {
  const who = `${announcement.name} (${announcement.player})`;
  switch (announcement.kind) {
    case 'win':
      return `${who} won ${gameName(announcement.game)} in ${actionWords(announcement.actions)}`;
    case 'death':
      return `${who} died ${whereWords(announcement)} at level ${announcement.level}`;
    case 'boss':
      // The games count their bosses from zero and their players do not.
      return `${who} beat Boss ${announcement.which + 1}`;
    case 'kills':
      return `${who} has killed ${announcement.which} monsters`;
    case 'find':
      return `${who} found a ${ANNOUNCED_FINDS[announcement.which]}`;
    case 'dungeon':
      return `${who} reached ${dungeonName(announcement.game, announcement.which)}`;
    case 'level':
      return `${who} reached level ${announcement.which}`;
    case 'floor':
      return `${who} reached floor ${announcement.which}`;
  }
}

/**
 * Where a run ended.
 *
 * Floor 0 is the town in all three games, and a town has no floor number worth saying. Moraff's
 * Revenge has one dungeon, so naming it would say nothing; the other two are played across modules
 * or dungeons and which one the character was in is half the story.
 */
function whereWords(announcement: Announcement): string {
  if (announcement.floor === 0) return 'in the town';
  if (announcement.game === 'revenge') return `on floor ${announcement.floor}`;
  return `on floor ${announcement.floor} of ${dungeonName(announcement.game, announcement.dungeon)}`;
}
