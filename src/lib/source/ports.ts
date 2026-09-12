/**
 * The app's own source, as text, so the Source tab can show what it runs.
 *
 * A production build minifies every name away, so a function cannot be read back with
 * toString(); each file is imported with Vite's ?raw suffix instead and scanned for its
 * declarations. The port's documentation comments cite the function they came from, as in
 * `(exe 3000:d904, unf.c "sleep_monster")`, and that citation is what ties a function here to a
 * function in `dotu-tools/decomp/unf.c` or `mw-tools/decomp/mw.c`, in both directions.
 *
 * Each file belongs to the game it is a port of, which is the game whose decompilation its
 * citations name and the game whose Source tab lists it.
 */
import type { GameId } from '../app-state.svelte';
import { declarations, type PortFunction as CitedFunction } from './citations';
import toHitSource from '../bestiary/to-hit.ts?raw';
import rollSource from '../bestiary/roll.ts?raw';
import dropsSource from '../calculators/drops.ts?raw';
import filesSource from '../game/dotu-files.js?raw';
import characterSource from '../game/port/character.ts?raw';
import combatSource from '../game/port/combat.ts?raw';
import hintsSource from '../game/port/hints.ts?raw';
import momentSource from '../game/port/moment.ts?raw';
import recordSource from '../game/port/record.ts?raw';
import mechSource from '../game/dotu-mech.js?raw';
import magicSource from '../game/port/magic.ts?raw';
import rngSource from '../game/port/rng.ts?raw';
import spellIndexSource from '../game/port/spell-index.ts?raw';
import stateSource from '../game/port/state.ts?raw';
import unfmapSource from '../game/unfmap.js?raw';
import areaSource from '../map/area.ts?raw';
import pathSource from '../map/path.ts?raw';
import relocateSource from '../map/relocate.ts?raw';
import stockingSource from '../map/stocking.ts?raw';
import playArrivalSource from '../play/arrival.ts?raw';
import playChuteSource from '../play/chute.ts?raw';
import playDigSource from '../play/dig.ts?raw';
import playEngineSource from '../play/engine.ts?raw';
import playFloorSource from '../play/floor.ts?raw';
import playHelpSource from '../play/help.ts?raw';
import playKeysSource from '../play/keys.ts?raw';
import playLaddersSource from '../play/ladders.ts?raw';
import playModulesSource from '../play/modules.ts?raw';
import playMoveSource from '../play/move.ts?raw';
import playQuitSource from '../play/quit.ts?raw';
import playScreensSource from '../play/screens.ts?raw';
import playTrapdoorSource from '../play/trapdoor.ts?raw';
import twinsSource from '../map/twins.ts?raw';
import mwCharacterSource from '../game/mw-port/character.ts?raw';
import mwSpellsSource from '../game/mw-port/spells.ts?raw';
import mwStateSource from '../game/mw-port/state.ts?raw';
import mwStockingSource from '../game/mw-port/stocking.ts?raw';
import mwmapSource from '../game/mwmap.js?raw';
import mwDungeonSource from '../game/mw-dungeon.ts?raw';
import mwMonstersSource from '../mw-bestiary/monsters.ts?raw';
import mwToHitSource from '../mw-bestiary/to-hit.ts?raw';
import mwEffectsSource from '../mw-spells/effects.ts?raw';
import revmapSource from '../game/revmap.js?raw';
import { snippet } from '../ui/source-snippet';

/** The Dungeons of the Unforgiven files, keyed by the path they live at in the repository. */
const UNFORGIVEN_SOURCES = {
  'src/lib/game/port/magic.ts': magicSource,
  'src/lib/game/port/combat.ts': combatSource,
  'src/lib/game/port/character.ts': characterSource,
  'src/lib/game/port/hints.ts': hintsSource,
  'src/lib/game/port/moment.ts': momentSource,
  'src/lib/game/port/record.ts': recordSource,
  'src/lib/game/port/state.ts': stateSource,
  'src/lib/game/port/rng.ts': rngSource,
  'src/lib/game/port/spell-index.ts': spellIndexSource,
  'src/lib/play/engine.ts': playEngineSource,
  'src/lib/play/move.ts': playMoveSource,
  'src/lib/play/ladders.ts': playLaddersSource,
  'src/lib/play/trapdoor.ts': playTrapdoorSource,
  'src/lib/play/chute.ts': playChuteSource,
  'src/lib/play/dig.ts': playDigSource,
  'src/lib/play/modules.ts': playModulesSource,
  'src/lib/play/quit.ts': playQuitSource,
  'src/lib/play/help.ts': playHelpSource,
  'src/lib/play/floor.ts': playFloorSource,
  'src/lib/play/arrival.ts': playArrivalSource,
  'src/lib/play/screens.ts': playScreensSource,
  'src/lib/play/keys.ts': playKeysSource,
  'src/lib/game/unfmap.js': unfmapSource,
  'src/lib/game/dotu-mech.js': mechSource,
  'src/lib/game/dotu-files.js': filesSource,
  'src/lib/bestiary/to-hit.ts': toHitSource,
  'src/lib/bestiary/roll.ts': rollSource,
  'src/lib/map/stocking.ts': stockingSource,
  'src/lib/map/path.ts': pathSource,
  'src/lib/map/area.ts': areaSource,
  'src/lib/map/relocate.ts': relocateSource,
  'src/lib/map/twins.ts': twinsSource,
  'src/lib/calculators/drops.ts': dropsSource,
};

/** The Moraff's World files, keyed the same way. */
const MORAFFS_WORLD_SOURCES = {
  'src/lib/game/mw-port/character.ts': mwCharacterSource,
  'src/lib/game/mw-port/spells.ts': mwSpellsSource,
  'src/lib/game/mw-port/state.ts': mwStateSource,
  'src/lib/game/mw-port/stocking.ts': mwStockingSource,
  'src/lib/game/mwmap.js': mwmapSource,
  'src/lib/game/mw-dungeon.ts': mwDungeonSource,
  'src/lib/mw-bestiary/monsters.ts': mwMonstersSource,
  'src/lib/mw-bestiary/to-hit.ts': mwToHitSource,
  'src/lib/mw-spells/effects.ts': mwEffectsSource,
};

/** The Moraff's Revenge files. Its dungeon generator is the only one of that game's files the
 *  Source tab shows so far. */
const MORAFFS_REVENGE_SOURCES = {
  'src/lib/game/revmap.js': revmapSource,
};

/** Every file the app shows the source of, keyed by the path it lives at in the repository. */
export const SOURCES = { ...UNFORGIVEN_SOURCES, ...MORAFFS_WORLD_SOURCES, ...MORAFFS_REVENGE_SOURCES };

export type SourceFile = keyof typeof SOURCES;

const FILES: Record<GameId, SourceFile[]> = {
  unforgiven: Object.keys(UNFORGIVEN_SOURCES) as SourceFile[],
  moraffsWorld: Object.keys(MORAFFS_WORLD_SOURCES) as SourceFile[],
  revenge: Object.keys(MORAFFS_REVENGE_SOURCES) as SourceFile[],
};

/**
 * One game's files, in the order the Source tab lists them: the port first, then what reads it.
 *
 * A caller that names no game means Dungeons of the Unforgiven, which is the game most of the
 * site is about.
 */
export function sourceFiles(game: GameId = 'unforgiven'): SourceFile[] {
  return FILES[game];
}

/** One declaration of one of the files the Source tab lists. */
export type PortFunction = CitedFunction<SourceFile>;

/** One file with the declarations it holds. */
export interface PortFile {
  file: SourceFile;
  functions: PortFunction[];
}

const PORT_FILES: Record<GameId, PortFile[]> = {
  unforgiven: FILES.unforgiven.map((file) => ({ file, functions: declarations(file, SOURCES[file]) })),
  moraffsWorld: FILES.moraffsWorld.map((file) => ({ file, functions: declarations(file, SOURCES[file]) })),
  revenge: FILES.revenge.map((file) => ({ file, functions: declarations(file, SOURCES[file]) })),
};

/** One game's files with the declarations they hold, in the order the Source tab lists them. */
export function portFiles(game: GameId = 'unforgiven'): PortFile[] {
  return PORT_FILES[game];
}

const ALL = [...PORT_FILES.unforgiven, ...PORT_FILES.moraffsWorld, ...PORT_FILES.revenge].flatMap((entry) => entry.functions);

const BY_C_NAME: Record<GameId, Map<string, PortFunction[]>> = {
  unforgiven: new Map(),
  moraffsWorld: new Map(),
  revenge: new Map(),
};
for (const fn of ALL) {
  if (!fn.c) continue;
  const byName = BY_C_NAME[fn.c.game];
  const ported = byName.get(fn.c.name);
  if (ported) ported.push(fn);
  else byName.set(fn.c.name, [fn]);
}

/** Every declaration of every file of both games, which is what the Source tab searches. */
export function allPortFunctions(): PortFunction[] {
  return ALL;
}

/** One declaration, or null where the file does not declare that name. */
export function portFunction(file: SourceFile, name: string): PortFunction | null {
  return ALL.find((fn) => fn.file === file && fn.name === name) ?? null;
}

/** The functions ported from one decompiled function, which is the citation read backwards. */
export function portsOfC(name: string, game: GameId = 'unforgiven'): PortFunction[] {
  return BY_C_NAME[game].get(name) ?? [];
}

/** The source text of one declaration, documentation comment included. */
export function portCode(file: SourceFile, name: string): string {
  return snippet(SOURCES[file], name);
}
