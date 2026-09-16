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
 * It is what the Admin tab is shown on, so it is asked once as the page loads and the answer is
 * held in `app.admin` from then on. A browser that signs in as an admin part-way through a visit
 * gets the tab on the next load.
 */
export async function whoAmI(): Promise<string | null> {
  const answer = await askTheServer<{ name?: unknown }>('GET', '/admin/me');
  if (!answer.ok || typeof answer.body.name !== 'string') return null;
  return answer.body.name;
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

/** One call to an admin endpoint carrying the words this browser keeps. */
async function askTheServer<Body>(method: string, path: string, body?: unknown): Promise<AdminAnswer<Body>> {
  const server = runServerUrl();
  const passphrase = myPassphrase();
  if (server === null || passphrase === null) return { ok: false, message: NOTHING_TO_ASK };
  const said = { Authorization: `Bearer ${passphrase}` };
  try {
    const response = await fetch(`${server}${path}`, {
      method,
      headers: body === undefined ? said : { 'Content-Type': 'application/json', ...said },
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
