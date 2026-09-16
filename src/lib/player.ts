import { readStored, removeStored, writeStored } from './character/storage';
import { runServerUrl } from './run-server';

/**
 * Who this browser is to the run server.
 *
 * Nobody signs up. The browser makes itself a random 32-byte secret the first time anything here
 * needs one and keeps it beside the roster; the server knows the player by that secret and shows
 * the name they claimed with it. Clearing the browser's storage loses the secret, and there is
 * nothing that gets it back.
 *
 * Beside the secret is the one thing a player says about whether to be on the boards at all.
 *
 * A name is not stuck on the device it was claimed on: claiming one is answered with a passphrase
 * of six words, and a browser that says that name and those words is let in as the same player,
 * with its own secret beside the first. The browser keeps the words it was handed or signed in
 * with, because the run server's admin endpoints take the passphrase and nothing else.
 */

/** Where the secret is kept, beside `moraff-tools.roster` and the rest. */
const SECRET_KEY = 'moraff-tools.player-secret';

/** Where the opt-out is kept, beside the secret. */
const OFF_THE_BOARDS_KEY = 'moraff-tools.off-the-boards';

/** Where the passphrase is kept, beside the secret. */
const PASSPHRASE_KEY = 'moraff-tools.passphrase';

/** A secret is 43 base64url characters, which is what 32 bytes come to without padding. */
const SECRET = /^[A-Za-z0-9_-]{43}$/;

/**
 * What a call to the server came back with: the name that now stands, or words to show.
 *
 * `passphrase` is the six words a name is handed the once, when claiming it made a player. Every
 * other answer has none, since the server keeps only their hash and cannot say them again.
 */
export type NameAnswer = { ok: true; name: string; passphrase: string | null } | { ok: false; message: string };

/** What asking for a new passphrase came back with. */
export type PassphraseAnswer = { ok: true; passphrase: string } | { ok: false; message: string };

/** The words shown when the call could not be made or could not be understood. */
const NO_SERVER = 'This build has no boards to be on.';
const NO_ANSWER = 'The boards did not answer. Try again in a moment.';

/**
 * This browser's secret, made and kept the first time it is asked for.
 *
 * A browser that will not keep anything -- a private window with site data blocked -- still gets
 * a secret, so the page works; it is a new one on the next visit, and its runs belong to nobody
 * this visit ever sees again.
 */
export function playerSecret(): string {
  const kept = readStored(SECRET_KEY);
  if (kept !== null && SECRET.test(kept)) return kept;
  const made = newSecret();
  writeStored(SECRET_KEY, made);
  return made;
}

/**
 * Whether this browser has opted out of the boards. A browser that has said nothing is on them,
 * so the runs of a player who never opens the setting are sent.
 *
 * While this is true nothing about any character leaves the device: `src/lib/play/streaming.ts`
 * asks before every batch, so turning it off part-way through a run stops the sending there and
 * then, and turning it back on sends from then on.
 */
export function offTheBoards(): boolean {
  return readStored(OFF_THE_BOARDS_KEY) === 'yes';
}

/** Opt this browser out of the boards, or back on to them. */
export function setOffTheBoards(off: boolean): void {
  if (off) writeStored(OFF_THE_BOARDS_KEY, 'yes');
  else removeStored(OFF_THE_BOARDS_KEY);
}

/**
 * The passphrase this browser last learned, or null when it has learned none.
 *
 * The run server's admin endpoints take the passphrase and nothing else -- they are reached off a
 * piece of paper and into curl as readily as from a page -- so keeping the words is what lets the
 * Admin tab ask the server anything without them being typed again (`src/lib/admin/`).
 *
 * The words are kept beside the secret and are worth rather more: the secret plays as this player
 * in this browser, and the words play as them anywhere. A browser somebody else can read is
 * already a browser that plays as this player, so what is added is that they could carry the
 * player elsewhere.
 */
export function myPassphrase(): string | null {
  return readStored(PASSPHRASE_KEY);
}

/** Keeps the words, whether the server just handed them over or the player just proved they are
 *  theirs. */
function keepPassphrase(passphrase: string): void {
  writeStored(PASSPHRASE_KEY, passphrase);
}

function newSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const binary = String.fromCharCode(...bytes);
  // base64url: the two characters that mean something of their own in a URL swapped out, and the
  // padding dropped, so the secret can go in a header or a path untouched.
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** The name this browser has on the boards, or null when it has none -- or when this build has no
 *  server to ask. */
export async function myName(): Promise<string | null> {
  const server = runServerUrl();
  if (server === null) return null;
  try {
    const response = await fetch(`${server}/players/me`, { headers: bearer() });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    if (body === null || typeof body !== 'object') return null;
    const name = (body as { name?: unknown }).name;
    return typeof name === 'string' ? name : null;
  } catch {
    return null;
  }
}

/** Claims the name for this browser's secret, and says what the server made of it. A name nobody
 *  held makes a player, and the answer carries that player's passphrase. */
export async function claimName(name: string): Promise<NameAnswer> {
  const answer = nameIn(await tellTheBoards('/players', { name }));
  if (answer.ok && answer.passphrase !== null) keepPassphrase(answer.passphrase);
  return answer;
}

/**
 * Asks the server to let this browser play as a name claimed on another device, which it does if
 * the passphrase is that name's. From then on this browser is that player: its runs stand under
 * the name and the device the name was claimed on keeps it too.
 */
export async function signIn(name: string, passphrase: string): Promise<NameAnswer> {
  const answer = nameIn(await tellTheBoards('/players/sign-in', { name, passphrase }));
  if (answer.ok) keepPassphrase(passphrase);
  return answer;
}

/** Draws this browser's player a new passphrase, which stops the one they had working. */
export async function newPassphrase(): Promise<PassphraseAnswer> {
  const answer = await tellTheBoards('/players/passphrase', {});
  if (!answer.answered) return { ok: false, message: answer.message };
  const passphrase = answer.body.passphrase;
  if (typeof passphrase !== 'string') return { ok: false, message: NO_ANSWER };
  keepPassphrase(passphrase);
  return { ok: true, passphrase };
}

/** What one call to the server came to: what it answered with, or the words to show instead. */
type BoardsAnswer = { answered: true; body: Record<string, unknown> } | { answered: false; message: string };

/** One POST to the run server carrying this browser's secret. */
async function tellTheBoards(path: string, body: unknown): Promise<BoardsAnswer> {
  const server = runServerUrl();
  if (server === null) return { answered: false, message: NO_SERVER };
  try {
    const response = await fetch(`${server}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...bearer() },
      body: JSON.stringify(body),
    });
    const answered: unknown = await response.json();
    const said = answered !== null && typeof answered === 'object' ? (answered as Record<string, unknown>) : {};
    if (response.ok) return { answered: true, body: said };
    // A refusal carries the words to show: the server is where the rules about a name and a
    // passphrase live.
    return { answered: false, message: typeof said.error === 'string' ? said.error : NO_ANSWER };
  } catch {
    return { answered: false, message: NO_ANSWER };
  }
}

/** The name and any passphrase in what the server answered a claim or a sign-in with. */
function nameIn(answer: BoardsAnswer): NameAnswer {
  if (!answer.answered) return { ok: false, message: answer.message };
  const name = answer.body.name;
  if (typeof name !== 'string') return { ok: false, message: NO_ANSWER };
  const passphrase = answer.body.passphrase;
  return { ok: true, name, passphrase: typeof passphrase === 'string' ? passphrase : null };
}

function bearer(): Record<string, string> {
  return { Authorization: `Bearer ${playerSecret()}` };
}
