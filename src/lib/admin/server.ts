import { app } from '../app-state.svelte';
import { myPassphrase } from '../player';
import { runServerUrl } from '../run-server';
// The shape the server answers with, and nothing but the shape: this is a type, so none of the
// server's code comes along with it.
import type { AdminCharacters } from '../../../server/admins';

/**
 * Every call the Admin tab makes to the run server.
 *
 * The admin endpoints take a passphrase and nothing else, which is the six words the browser kept
 * the last time it was handed them or signed in with them (`src/lib/player.ts`). A browser that
 * has learned no words, and a build that was given no server address, ask nobody.
 *
 * A refusal carries the words to show, because the server is where the rules about an admin live.
 * Everything under `/admin/` answers somebody who is not an admin the same 404 a path the server
 * does not know is answered, so a browser whose words are nobody's is simply told there is no
 * such endpoint, and never learns there was an Admin tab.
 */

/** What one call came to: what the server answered with, or the words to show instead. */
export type AdminAnswer<Body> = { ok: true; body: Body } | { ok: false; message: string };

/** The words shown when the call could not be made or could not be understood. */
const NOTHING_TO_ASK = 'There is no server to ask, or this browser has no passphrase.';
const NO_ANSWER = 'The server did not answer. Try again in a moment.';

/**
 * The name the run server knows this browser's player by, when the words this browser keeps are
 * an admin's, and null for everybody else.
 *
 * It is what the Admin tab is shown on, and `askWhetherAdmin` is what holds the answer where the
 * tabs read it.
 */
export async function whoAmI(): Promise<string | null> {
  const answer = await askTheServer<{ name?: unknown }>('GET', '/admin/me');
  if (!answer.ok || typeof answer.body.name !== 'string') return null;
  return answer.body.name;
}

/**
 * Asks the question above and holds the answer in `app.admin`, which is where `src/lib/tabs.ts`
 * reads whether to draw the Admin tab.
 *
 * It is asked as the page loads, and again whenever this browser learns a passphrase: claiming a
 * name, signing in as one claimed elsewhere, and drawing a new passphrase all leave the browser
 * keeping different words from the ones the page load asked about. An answer of nobody takes the
 * tab away again, which is what a browser holding words that have stopped being an admin's gets.
 */
export async function askWhetherAdmin(): Promise<void> {
  app.admin = await whoAmI();
}

/** One page of every character here, whoever's it is, the newest first. Pages count from one. */
export async function loadCharacters(page: number): Promise<AdminAnswer<AdminCharacters>> {
  return await askTheServer<AdminCharacters>('GET', `/admin/characters?page=${page}`);
}

/** Forgets one character for good, whoever it belongs to: its run, the verdict on it and whatever
 *  was announced about it go with it. */
export async function forgetCharacter(characterId: string): Promise<AdminAnswer<{ forgotten: string }>> {
  return await askTheServer('DELETE', `/admin/characters/${encodeURIComponent(characterId)}`);
}

/**
 * Opens a new endless world, which every endless character rolled from now on is rolled into and
 * which every character already rolled is left out of.
 *
 * A seed of null asks the server to draw a number, for an admin who wants a fresh dungeon and does
 * not mind which. Either way the answer says the world that now stands.
 */
export async function openNewEndlessWorld(seed: number | null): Promise<AdminAnswer<{ world: number }>> {
  return await askTheServer('POST', '/admin/worlds/endless', seed === null ? {} : { seed });
}

/**
 * Makes another player an admin, and says the name that now stands.
 *
 * They are named rather than picked out of a list because the name is the only thing anybody here
 * knows about a player. The player has to have claimed the name already: this flags a row and does
 * not make one.
 */
export async function flagAnotherAdmin(name: string): Promise<AdminAnswer<{ admin: string }>> {
  return await askTheServer('POST', '/admin/admins', { name });
}

/** One call to an admin endpoint carrying the words this browser keeps. */
async function askTheServer<Body>(method: string, path: string, body?: unknown): Promise<AdminAnswer<Body>> {
  const server = runServerUrl();
  const passphrase = myPassphrase();
  if (server === null || passphrase === null) return { ok: false, message: NOTHING_TO_ASK };
  const words = { Authorization: `Bearer ${passphrase}` };
  try {
    const response = await fetch(`${server}${path}`, {
      method,
      headers: body === undefined ? words : { 'Content-Type': 'application/json', ...words },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const answered: unknown = await response.json();
    if (response.ok) return { ok: true, body: answered as Body };
    const error = answered !== null && typeof answered === 'object' ? (answered as { error?: unknown }).error : null;
    return { ok: false, message: typeof error === 'string' ? error : NO_ANSWER };
  } catch {
    return { ok: false, message: NO_ANSWER };
  }
}
