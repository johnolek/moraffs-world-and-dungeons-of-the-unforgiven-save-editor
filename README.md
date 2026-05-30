# Moraff Save Editor

A single-file, browser-based character editor for **Moraff's World** and
**Dungeons of the Unforgiven**. Everything runs locally — no data is uploaded.

## Usage

1. Open `index.html` in a browser.
2. Upload your save file (named `1`, `2`, `3`… in Moraff's World, or `21`, `22`,
   `23`… in DotU — one file per character).
3. Edit stats, items, spells, and flags.
4. Download the edited file and overwrite the original.

**Back up your saves first.** Provided as-is, with no guarantee it works for
everything.

## What you can edit

### Moraff's World

- **Identity** — character name
- **Level & Experience** — player level, experience points
- **Vitals** — current/max HP, current/max SP, naked/loaded weight
- **Stats** — strength, intelligence, wisdom, constitution, agility, luck
- **Money** — jewels in pocket, jewels in bank
- **Stones** — copper, silver, ivory, gold, platinum, jewel
- **Position** — facing direction, X/Y, current floor, module
- **Weapons** — owned flags + enchant levels (8 weapons), currently equipped
- **Armor** — owned flags + enchant levels (8 armors), currently equipped
- **Vitamin Pills** — orange, green, blue, red, white, yellow
- **Afflictions** — disease timer, poison timer
- **Special Items** — potions of healing, stones of teleportation, holy hand
  grenades, stones of seeing, floor sloshers, feather, invisibility, fast move
- **Rings & Worn Items** — rings of regeneration, body armor, ring of
  protection, anti-magic ring, gauntlets
- **Trapdoor Keys** — floors 10–200
- **Spellbook / Scrolls / Wands / Papers** — permanent, preparation, wizard,
  and priest spell lists

### Dungeons of the Unforgiven

- **Identity** — character name, race, gender, class
- **Level & Experience** — player level, experience points
- **Vitals** — current/max HP, current/max SP, height, naked/loaded weight, age
- **Stats** — strength, intelligence, wisdom, constitution, agility, luck
- **Money & Resources** — rubles in pocket, rubles in bank, culture stock,
  children helped, magic crystals, American dollars
- **Position** — facing direction, X/Y, current floor, module
- **Weapons** — owned flags + enchant levels (8 weapons), currently equipped
- **Armor** — owned flags + enchant levels (8 armors), currently equipped
- **Potions** — orange, green, blue, red, white, yellow
- **Afflictions** — disease timer, poison timer
- **Special Items** — potions of healing, stones of teleportation, nuclear hand
  grenades, stones of seeing, floor sloshers
- **Rings & Worn Items** — rings of regeneration, body armor, ring of
  protection, anti-magic ring, gauntlets
- **Preparation Spells in Effect** — enchant weapon/armor levels, feather, fast
  move, invisibility, preparation strength/agility, super strength/agility
- **Battle Spell Timers** — strength, speed, slow enemies, power weapon,
  protection, resist poison/disease, anti-cold/fire, resist level drain, sleep,
  hold monster
- **Trapdoor Keys** — floors 0–100
- **Spellbook / Scrolls / Wands / Papers** — permanent, preparation, wizard,
  and priest spell lists
- **Misc** — difficulty, fill HP/SP on load

## Credits

The Dungeons of the Unforgiven character file format was reverse engineered and
documented by **Spectere** and **Bag of Magic Food** — see the
[DOS Game Modding Wiki](https://moddingwiki.shikadi.net/wiki/Dungeons_of_the_Unforgiven_Player_Character).