-- How many monsters a run killed, which is the third of the endless dungeon's own boards.
--
-- It is counted off the journal the replay wrote when the verdict is stored, the way `deepest` and
-- `level` are read off the milestones, so that ordering a board never means reading JSON:
-- `server/boards.ts` is how it is counted, since a board is what it is for.
--
-- A verdict written before this column existed counts no kills until the run is replayed again.
ALTER TABLE verdicts ADD COLUMN kills integer NOT NULL DEFAULT 0;
