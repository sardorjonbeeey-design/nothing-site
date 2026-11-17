-- Players sold to the system leave the game. They are kept (not deleted) because transfer history references them.
ALTER TABLE players ADD COLUMN IF NOT EXISTS retired BOOLEAN NOT NULL DEFAULT FALSE;
