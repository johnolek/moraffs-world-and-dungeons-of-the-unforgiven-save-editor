-- The mode a character is played in for the rest of its life, which the roller decides beside the
-- board and which outlives it: a record written from outside the game takes the character off its
-- board, and it is still the faithful or the speedrun character it was rolled as. A character that
-- can be played whichever way its player likes has none.
--
-- `leaderboard` stays what it was, the board the character's runs go on, and a character is only
-- ever on the board of the mode it is locked to. A character kept here before these were two
-- questions has no lock written down, and the board it names is the mode it was locked to, which
-- is how the site reads one back.
ALTER TABLE characters ADD COLUMN play_lock text;
