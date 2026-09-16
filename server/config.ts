/**
 * What the run server needs to know about the box it is running on. All of it comes from the
 * environment, so a deploy is a few variables and nothing to edit in the repository.
 */
export interface ServerConfig {
  /** The port to answer HTTP on. John's reverse proxy is what the public reaches. */
  port: number;
  /** The Postgres everything is kept in, as a connection string. */
  databaseUrl: string;
  /** The deployed site's origin, which the browser has to be told may read the answers. */
  allowedOrigin: string;
  /** The player to flag as an admin at start, or null when the box names none. */
  adminPlayer: string | null;
}

/** Claude's own range is 3500-3599; John assigns the port the server really runs on. */
const DEFAULT_PORT = 3580;

/** The GitHub Pages site these tools are deployed to. */
const DEFAULT_ALLOWED_ORIGIN = 'https://johnolek.github.io';

export function configFromEnvironment(environment: NodeJS.ProcessEnv = process.env): ServerConfig {
  return {
    port: portFrom(environment.RUN_SERVER_PORT),
    databaseUrl: databaseUrlFrom(environment.DATABASE_URL),
    allowedOrigin: environment.RUN_SERVER_ORIGIN ?? DEFAULT_ALLOWED_ORIGIN,
    adminPlayer: adminPlayerFrom(environment.ADMIN_PLAYER),
  };
}

/** The player the box calls its admin, or null where it names none, which leaves the server with
 *  no admin at all and every admin endpoint answering as if it were not there. */
function adminPlayerFrom(value: string | undefined): string | null {
  const named = value?.trim() ?? '';
  return named === '' ? null : named;
}

function portFrom(value: string | undefined): number {
  if (value === undefined) return DEFAULT_PORT;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`RUN_SERVER_PORT is not a port number: ${value}`);
  }
  return port;
}

/** There is no sensible default for somebody else's database, so a server with nowhere to keep
 *  anything says so rather than starting and connecting to whatever is nearest. */
function databaseUrlFrom(value: string | undefined): string {
  if (value === undefined || value === '') {
    throw new Error('DATABASE_URL is not set, and the run server keeps everything in Postgres.');
  }
  return value;
}
