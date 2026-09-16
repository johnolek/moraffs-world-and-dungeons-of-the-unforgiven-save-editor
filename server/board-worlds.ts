import type { EndlessWorlds } from './boards';
import type { Queries } from './sql';
import { currentEndlessWorld } from './worlds';

/**
 * The boards' questions that need the worlds table.
 *
 * They are apart from `server/boards.ts` because the site imports that module, and this one
 * reaches `server/worlds.ts`, which draws a world with `node:crypto`. A browser has no
 * `node:crypto`, so anything the site bundles must not reach it; `server/site-imports.test.ts`
 * holds that line.
 */

/**
 * The endless worlds of one game there is anything to show.
 *
 * The world being played now is always offered, even where nobody has finished a run in it yet:
 * it is the board a reader arriving is looking for, and an empty board of it says the true thing
 * about it. The rest are the worlds some character of this game stands on a board in, which is a
 * run that has ended with a verdict that may go on a board, or a character still being played
 * whose chain the replay passed — exactly who the boards of that world hold.
 */
export async function endlessWorlds(sql: Queries, game: string): Promise<EndlessWorlds> {
  const rows = await sql.query<{ world_seed: number }>(
    `SELECT c.world_seed, max(c.created_at) AS newest
     FROM characters c
     WHERE c.game = $1 AND c.world_seed IS NOT NULL
       AND (EXISTS (SELECT 1 FROM verdicts v
                    WHERE v.character_id = c.id AND v.leaderboard = 'endless' AND v.eligible)
            OR EXISTS (SELECT 1 FROM living l
                       WHERE l.character_id = c.id AND l.leaderboard = 'endless'
                         AND l.status = 'verified'))
     GROUP BY c.world_seed
     ORDER BY newest DESC`,
    [game],
  );
  const current = await currentEndlessWorld(sql);
  const older = rows.map((row) => row.world_seed).filter((world) => world !== current);
  return { game, current, worlds: [current, ...older] };
}

/**
 * The world a board is read for, and null for a board that is one dungeon and has no world to be
 * read for.
 *
 * Only the endless dungeon has worlds. A request that names none is asking for the world being
 * played now, since that is the board anybody arriving is looking for.
 */
export async function boardWorld(sql: Queries, leaderboard: string, asked: number | null): Promise<number | null> {
  if (leaderboard !== 'endless') return null;
  return asked ?? (await currentEndlessWorld(sql));
}
