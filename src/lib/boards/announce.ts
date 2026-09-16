import { actionWords } from '../play/run';
import { dungeonName, gameName } from './words';
// The server sends fields and no sentence, so this is the one place either page turns one of its
// rows into words. The row is a type and nothing else; the finds are a table of names, which is
// all that `server/boards.ts` is safe to import a value from.
import type { Announcement } from '../../../server/announcing';
import { ANNOUNCED_FINDS } from '../../../server/boards';

/**
 * The character and the player, which every announcement sentence begins with.
 *
 * An announcement is read on its own in a feed of other people's runs, so it has to say whose it
 * is without anything around it. It stands apart from the rest of the sentence because the feed
 * draws it as a link to that character's run and the rest as plain words.
 */
export function announcementWho(announcement: Announcement): string {
  return `${announcement.name} (${announcement.player})`;
}

/** What an announcement says happened, with no character named in front of it. */
export function announcementDid(announcement: Announcement): string {
  switch (announcement.kind) {
    case 'win':
      return `won ${gameName(announcement.game)} in ${actionWords(announcement.actions)}`;
    case 'death':
      return `died ${whereWords(announcement)} at level ${announcement.level}`;
    case 'boss':
      // The games count their bosses from zero and their players do not.
      return `beat Boss ${announcement.which + 1}`;
    case 'shadow':
      return `killed the Shadow on floor ${announcement.which}`;
    case 'kills':
      return `has killed ${announcement.which} monsters`;
    case 'find':
      return `found a ${ANNOUNCED_FINDS[announcement.which]}`;
    case 'dungeon':
      return `reached ${dungeonName(announcement.game, announcement.which)}`;
    case 'level':
      return `reached level ${announcement.which}`;
    case 'floor':
      return `reached floor ${announcement.which}`;
  }
}

/** The whole of what an announcement says, for the places that draw it as one piece of text. */
export function announcementWords(announcement: Announcement): string {
  return `${announcementWho(announcement)} ${announcementDid(announcement)}`;
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
