# Moraff's Dungeons of the Unforgiven — reverse-engineering notes

Everything below was recovered from the DOS executable in your game folder
(`unf.exe`, "Copyright 1993, by Steve Moraff", registered all-modules build; PKLITE
1.05 packed), cross-checked against the recovered `UNF.CPP` in the Jimbly/unforgiven
repo and against your own character files. Where a number comes straight from a
constant in the binary I say "exe"; where it only comes from the recovered source I say
"source". The recovered source is the WORLD module only (combat, movement, file I/O);
the TOWN, MAGICFNC, CAT and STRUCTS modules were never recovered, so everything about
shops, the inn, spells, loot and the character struct had to come from disassembly.

Formulas use the game's own names: `lev` = character level, `level` = dungeon depth,
`module` = 0..4 (Module I..V), `random(n)` = Borland `random()` = 0..n-1,
`Random(n)` = the game's reseeding variant (same range). Integer division truncates.

---

## 1. Progression

### 1.1 Experience needed per level (exe, constants at DS:0421/0429/12d6/12da)

```
exp_needed(l) = 250 * 1.4^(l-1) - 80      normal difficulty
exp_needed(l) = 250 * 2.0^(l-1)           "I can handle anything"
```

You become level L as soon as `exp > exp_needed(L-1)`, i.e. **XP needed to reach
level L = 250·1.4^(L−2) − 80 (normal) or 250·2^(L−2) (hard)**. The level-up is only
applied when you rest at an inn (`check_gain_level()` is called from the inn; the kill
routine only prints a hint). The game's "E" screen prints exactly these numbers.

| Reach level | Normal | I can handle anything |
|---:|---:|---:|
| 1 | 99 | 125 |
| 2 | 170 | 250 |
| 3 | 270 | 500 |
| 4 | 410 | 1,000 |
| 5 | 606 | 2,000 |
| 6 | 880 | 4,000 |
| 7 | 1,265 | 8,000 |
| 8 | 1,802 | 16,000 |
| 9 | 2,555 | 32,000 |
| 10 | 3,609 | 64,000 |
| 11 | 5,085 | 128,000 |
| 12 | 7,151 | 256,000 |
| 13 | 10,044 | 512,000 |
| 14 | 14,093 | 1,024,000 |
| 15 | 19,763 | 2,048,000 |
| 16 | 27,700 | 4,096,000 |
| 17 | 38,812 | 8,192,000 |
| 18 | 54,369 | 16,384,000 |
| 19 | 76,148 | 32,768,000 |
| 20 | 106,640 | 65,536,000 |
| 21 | 149,328 | 131,072,000 |
| 22 | 209,091 | 262,144,000 |
| 23 | 292,759 | 524,288,000 |
| 24 | 409,894 | 1,048,576,000 |
| 25 | 573,884 | 2,097,152,000 |
| 26 | 803,470 | 4,194,304,000 |
| 27 | 1,124,890 | 8,388,608,000 |
| 28 | 1,574,878 | 16,777,216,000 |
| 29 | 2,204,861 | 33,554,432,000 |
| 30 | 3,086,837 | 67,108,864,000 |

Sanity check against your saves: LUCKSTER (hard, lev 45) has 2.42e15 XP, and
250·2^43 = 2.20e15 ≤ 2.42e15 < 250·2^44 = 4.40e15. Level drain sets
`exp = exp_needed(lev-1)` after subtracting the levels (source, `defend()`), and a
"−30 XP" drainer (Sustrontima) just subtracts 30.

### 1.2 Gains per level — `go_up_level()` (exe, 3000:bd9a)

`lev += 1`, then by class (`con`, `luck`, `wiz`, `iq` are current stats):

| Class | max HP gain | max SP gain |
|---|---|---|
| FIGHTER | `random(2·con + luck/2 + 10) + 35` | none |
| WORSHIPPER | `random(con/2 + luck/2 + 10) + 15` | `(2·wiz + iq)/3` |
| MONK | `random(con/2 + luck/3 + 5) + 14` | `(wiz + iq)/13` |
| WIZARD | `random(con/3 + luck/5 + 4) + 13` | `(wiz + 2·iq)/5` |
| PRIEST | `random(con/2 + luck/3 + 4) + 14` | `(2·wiz + iq)/5` |
| SAGE | `random(3·con + luck + 17) + 55` | `(wiz + iq)/14` |
| MAGE | `random(con/2 + luck/3 + 7) + 14` | `(wiz + 2·iq)/8` |

Afterwards `sp = totalsp` and current HP rises by the same amount max HP rose.
Yes, the Sage gets by far the most HP per level (roughly 3× a Fighter's) — that is
probably why the FAQ author found sages tankier than expected.

### 1.3 Starting stats — `roll_char()` (exe, 3000:5fda; the FAQ's formulas match)

Race base bonuses (added to a random spread), height/weight and the "age" column
from the race table at DS:0130:

| # | Race | STR | INT | WIS | CON | AGI | LUCK | height | weight | age col |
|--:|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| 0 | HUMANOID | 5 | 5 | 5 | 5 | 5 | 5 | 70 | 130 | 15 |
| 1 | APE | 1 | 6 | 5 | 2 | 6 | 4 | 54 | 80 | 10 |
| 2 | CHILDMAN | 7 | 0 | 2 | 8 | 6 | 1 | 47 | 100 | 8 |
| 3 | RODENT | 2 | 1 | 1 | 6 | 12 | 6 | 21 | 60 | 30 |
| 4 | HOBO | 0 | 7 | 5 | 2 | 7 | 4 | 41 | 60 | 130 |
| 5 | GIANT | 10 | 0 | 0 | 8 | 0 | 3 | 99 | 400 | 30 |
| 6 | MIDGET | 0 | 15 | 2 | 0 | 8 | 11 | 31 | 20 | 35 |
| 7 | SHRIMP | 0 | 11 | 9 | 3 | 0 | 4 | 26 | 100 | 17 |

The FAQ documents starting HP/SP/money; I did not re-derive `roll_char` because the
decompiler still chokes on that one function (see §10).

---

## 2. Town economics

All prices are in rubles. `hard` = 1 for "I can handle anything" characters.

### 2.1 General store (exe, 2000:45ab; price tables at DS:0363 / DS:0371)

| Weapon | price | Armor | price |
|---|--:|---|--:|
| STICK | 1 | ROBES/skin (useless) | 1 |
| CLUB | 15 | LEATHER | 50 |
| MACE | 300 | CHAIN | 300 |
| KNIFE | 30 | SCALE | 1,500 |
| SHORTSWORD | 250 | BREAST PLATE | 4,000 |
| LONG SWORD | 450 | FIELD PLATE | 9,900 |
| (GREAT SWORD, not offered) | 9,900 | (TITANIUM, not offered) | 60,000 |

The 7th entries exist in the price tables but the menus only accept keys 1–6, so
Great Swords and Titanium can only be found as loot.

**Culture stock**, price per unit:

```
price = ((lev/3 + 1) * lev² + 10) / 3
```

**Magic crystals**, price per unit:

```
price = ((lev/2 + 1) * lev² + 10) / 3      normal
price = ((lev/2 + 1) * lev² + 10) / 2      hard
```

You type an amount of rubles; you receive `amount / price` units and pay
`(amount / price) * price` (the remainder is not charged). Amounts below one unit are
refused. Prices depend only on `lev`, so nothing besides levelling makes them worse.

### 2.2 Inn ("Grub-Sleep", exe 2000:4fe7)

Room cost (the FAQ noted it "scales with level but the formula is unknown"):

```
cost = lev⁴ + 10 - children_helped * lev
cost = max(cost, (lev⁴ + 10) / 2)          (helping children can at most halve it)
```

Culture stock needed to avoid aging during the stay: `lev²` units.
Magic crystals needed to refill spell points: `totalsp − sp` (1 crystal per point).

What a stay does, in order:

1. `rubles -= cost` (or "you can't afford it" and nothing happens).
2. `realtime += 28800` (8 hours), inn/town hint text.
3. Aging: if `culture_stock < lev²` then `short = min(6, lev² − culture_stock)`,
   `culture_stock = 0`, and `age += short`. If you are already over 60 years old,
   the same `short` is subtracted from **STR and CON** (each floored at 2). Crossing
   60 during the stay prints the "you are getting old" message. If you had enough
   stock, `culture_stock -= lev²` and you do not age. There is no aging anywhere else
   in the game, and no death from old age.
4. Spell points: if `magic_crystals < totalsp − sp` you get what you have and the
   crystals go to 0; otherwise `sp = totalsp` and `crystals -= (totalsp − sp)`.
5. If `exp > exp_needed(lev)`: `lev = gain_level()`, which calls `go_up_level()` once
   per level gained (several at once if the XP allows). Losing XP (drainers, Youth)
   never lowers `lev` here — only a level drainer's hit does that directly.

So the effective per-rest upkeep at level L is `L⁴ + 10 − L·children` rubles plus
`L²` culture stock (each unit costing `((L/3+1)·L²+10)/3`) plus one crystal per SP
spent since last rest. At lev 45 that is ≈4.1M rubles a night, ≈2,025 stock at
≈10,800 each ≈ 21.9M — which is what your high-level characters are carrying around.

### 2.3 Temple (exe, 2000:4d39; price table at DS:037f)

| Key | Service | price | effect |
|--:|---|--:|---|
| 1 | Cure wounds | 10 | `hp += random(10) + 1` (capped at max) |
| 2 | Cure serious wounds | 100 | `hp += 4·random(45) + 10` (capped) |
| 3 | Heal all wounds | 500 | `hp = totalhp` |
| 4 | Cure poison | 300 | `poison = -1` |
| 5 | Cure disease | 500 | `disease = -1` |
| 6 | Help a needy child | 100 | `children_helped += 1` |
| 7 | Leave | 0 | |

Prices are flat — they never scale. "Children helped" is used by the inn cost formula
above and by the general store (exe 2000:428d): culture stock and magic crystal
purchases refund `min(children·price/100, price/2)` rubles ("YOU SAVED N RUBLES
BECAUSE YOU HAVE HELPED NEEDY CHILDREN"), so the store discount maxes out at 50
children; weapons and armor are never discounted.

### 2.4 Bank (exe, 2000:568b)

Exchange: `rubles += dollars / 100; dollars %= 100`. Deposit/withdraw move money
between `rubles` and `rubles_in_bank`. There is no interest and no fee. The 4th
option is just a message.

---

## 3. Killing a monster — XP and loot, in evaluation order (exe, 3000:b12d)

Let `L` = the monster's stored level (byte, see §4), `t` = monster type (0..26).

**XP value** (exe, 3000:a0fa; constants 1.23 and 5.0 at DS:2f60/2f68):

```
Lc = min(L, 130)
exp_value = (monster[t].exp + 1) * (Lc + 1 + 5 * 1.23^Lc)
```

`monster[t].exp` is the "exp" byte in the monster table (§4): 0 for a plain section
monster, 15 for every Shadow boss (×16), 2 for garbage cans/balls (×3), 4 for
poison/disease things (×5), 3–7 for the nastier section monsters. A monster with
exp = −1 gives nothing (none exist in your MD.BIN). The 1.23^L term dominates: a
level 60 kill is worth ≈1.2k×mult, level 100 ≈ 5.0M×mult, level 130 ≈ 4.0e11×mult.

**Level-drainer bonus** (only if `monster[t].ldrain > 0`):

* with probability `(level + 175) / 375` (so always at depth ≥ 200): a random stat
  potion, `potions[random(6)] += 1` (green, orange, yellow, red, blue, white);
* otherwise, if you don't yet have the key for this depth and `3 < level < 179`:
  you get **trapdoor key #(level/5·5)** (`keys[level/5] = 1`).

Then the corpse is removed and the following independent rolls happen:

**Weapon drop** (3000:a1fc) — skipped for Monks. `w = random(7)` picks
STICK..GREAT SWORD (index w+1); it drops if `random((w+1)·100) ≤ L + 10`, and only
if you do not already own one of that weapon. Per kill this is
`1/7 · min(1, (L+11) / (100·(w+1)))` for each weapon — a Great Sword needs
`random(700) ≤ L+10`, i.e. 1.6% at L = 0 rising to 100% at L ≥ 690 (never).

**Armor drop** (3000:a3d7) — skipped for Monks. `a = random(6)` picks
LEATHER..TITANIUM (index a+1); drops if `random((a+1)·100) ≤ L + 10`. Duplicates are
allowed (you are told how many you already have). So Titanium needs
`random(600) ≤ L + 10`: 1.8% per armor roll at depth 1, 10% at depth 50 — and it is
the only way to get it. In "high speed mode" (options menu 1) a weapon or armor worse
than one you already own is silently ignored.

**Money** (4000:6aca) — added to *American dollars* (100:1 at the bank):

```
n = level + 1
a = 0
if level > 4:      a = random(n²) * random(n) * random(n²)
if a == 0 and random(4) == 1:  a = random(200 n)
if a != 0:
    if class is WORSHIPPER or WIZARD:  a += random(200 level)
    if level < 5:                      a += random(200 level)
    elif level < 15:                   a += a/3
    elif level > 16:                   a -= a/3
    if normal difficulty:              a += random(7000)
    if class is SAGE:                  a *= 3
if a > 107,000,000:  a = 107,000,000 - random(32000)*random(1000)
dollars = min(dollars + a, 2,000,000,000)
```

The flavour message is chosen by the amount (<20, <200, <2000, <20000, <200000,
<1M, ≥1M) and `random(4)`.

**Post-kill recovery**: with probability 1/4, `hp += random(11) + 4` (+`random(4)`
more if level > 6), capped; with probability 1/6 (non-fighters), `sp += 1`.

**"YOU FIND..."** — only for non-Monks: chance `(level + 40) / 550` for FIGHTER and
SAGE, `(level + 40) / 950` for everyone else, and additionally `random(20) < level`
(always true from depth 20). Then `random(3) == 1` means "NOTHING", otherwise one of
12 equally likely finds (3000:ae27):

| roll | find | effect |
|--:|---|---|
| 0 | Nuclear hand grenade | `grenades += 1` |
| 1 | Stone of teleportation | `teleport_stones += 1` |
| 2 | Stone of seeing | `seeing_stones += 1` |
| 3 | Floor slosher | `slosher = 1` (only one, "two are no better than one") |
| 4 | Potion of healing | `potions_of_healing += 1` |
| 5 | Ring of regeneration | `regen_rings += 1` (each heals 1 HP per move) |
| 6–11 | Book of STR/INT/WIS/CON/AGI/LUCK | that stat `+= 2`, permanently |

**Spellbook** (3000:a65d) — not for FIGHTER or MONK; SAGE additionally needs
`Random(300−level) ≤ 175` and `Random(400−level) ≤ 140`.
`lvl = random(2·level/3)`, re-rolled as `random(10)` if ≥ 10; `type = random(4)`
(wizard books never for WORSHIPPER/PRIEST, priest books never for WIZARD/MAGE);
`slot = random(3)`. If you already know that spell nothing happens. Otherwise you
learn `spellbooks[type][lvl][slot]`.

If no book dropped, one of these is attempted (`random(3)`):

* **Scroll** (a870): not FIGHTER/MONK; needs `Random(350−level) ≤ 15` (≤ 45 for
  SAGE); `lvl = random((level+4)/2)` capped as above; same class filter on type;
  `scrolls[type][lvl][slot] += 1`.
* **Wand** (aa37): not FIGHTER/MONK; needs `Random(350−level) ≤ 15`;
  `lvl = random(level/2)` for SAGE else `random(level/4)`, capped; type is
  `random(3)+1` (never permanent); charges `random(5)+2`.
* **Spell paper** (ac6f): not MONK; needs `Random(350−level) ≤ 15`;
  `lvl = random(level/2)` for SAGE/FIGHTER else `random(level/6)`, capped;
  `type = random(4)`; `papers[type][lvl][slot] += 1`.

**Boss rewards** — when the monster is the section's Shadow (type 22) and that
section's objective bit is still clear (bits 1,2,4,8 of `objective[module]`):

| Section | Shadow boss | reward |
|--:|---|---|
| 1 | Gargalon | max HP +30 |
| 2 | Elemental | WIS +12 |
| 3 | Vulture | STR +12 |
| 4 | Demon Queen | one owned armor becomes **+25** |
| 5 | Troggisher | body armor 9 |
| 6 | Giant Worm | gauntlet +12 |
| 7 | Scorpion | ring of protection +15 |
| 8 | Skeeter | one owned weapon becomes **+25** |
| 9 | Head Hunter | LUCK +10 |
| 10 | Khagistoll | CON +10 |
| 11 | Eyeball | INT +10 |
| 12 | Mr. Fang | 10 stones of seeing |
| 13 | Warrior | body armor 25 |
| 14 | Ape-Man | gauntlet +50 |
| 15 | Dragon King | ring of protection +50 |
| 16 | Evil God | one owned armor becomes **+50** |
| 17 | Ogre | max HP +300 |
| 18 | Stone Giant | AGI +20 |
| 19 | Centipede | STR +25 |
| 20 | Ogeroth | one owned weapon becomes **+101** (the "Orb of Explosive Weapon Enhancement") |

That is where LUCKSTER's MACE +101 and TITANIUM +50 come from.

---

## 4. Monsters

### 4.1 Generation — `stock_level()` (exe, 2000:671e) and `get_mtype()` (2000:65f8)

A level holds 145 monster slots (6 bytes each: x, y, hp lo, hp hi, type, level).
Positions are `random(80), random(110)` re-rolled until the square is open and empty —
but each attempt is preceded by `srand(clock() + slot + counter)`, and Borland's LCG
gives outputs linear in the seed, so consecutive slots land about (+2, −2) apart: a
freshly stocked floor holds its monsters in diagonal stripes (visible in every real
`?MON.MAP`; see TIDBITS.md, "Random numbers that are not random").
The **effective monster level** is

```
Lm = level + 15 * module
```

so Module V depth 1 spawns level-61 monsters. Stored level byte = `Lm` (or 1 if
Lm ≥ 221), then `while random(3) == 0: L += random(3) − 1`, clamped to 1..210.

Type selection per slot:

| chance | type |
|---|---|
| 1/20 | a puffball, `random(12)+2` (types 2–13) |
| else 1/7 | garbage can or ball (`random(2)`) |
| else 1/15 | the section's level drainer (type 26) |
| else 1/12 | a poison/disease thing, `random(8)+14` (types 14–21) |
| else | one of the three ordinary section monsters, `random(3)+23` |

Slot 0 becomes the **Shadow boss (type 22)** on depths `5(module+1)`, `10(module+1)`,
`15(module+1)`, `20(module+1)` when that section's objective bit is clear (Module I:
5/10/15/20, Module II: 10/20/30/40, … Module V: 25/50/75/100). Its position is
`random(50)+25` in both axes the first time, then remembered per section
(`boss_x/boss_y` in the save) and re-rolled within ±7 of the old spot afterwards —
that is what the "GO EAST/WEST" homing text points at, and what `FIX.BAT` resets.

HP: `hp = (random(mhp·Lm + 1) + random(mhp·Lm + 1) + 2) / 2` with `mhp` from the
type table below; bosses add `20·Lm` and double it in sections 18–20; clamped to
1..32000.

### 4.2 Type table (`mstats`, exe DS:5402)

| type | to-hit armor | damage die | HP/level | dex | message |
|--:|--:|--:|--:|--:|---|
| 0 | 26 | 3 | 200 | 6 | WHAT AN ANNOYING MONSTER... |
| 1 | 2 | 2 | 200 | 8 | IT IS BLOCKING YOUR WAY |
| 2 | 2 | 2 | 2 | 16 | THIS ONE WILL CHANGE YOU... |
| 3 | 10 | 5 | 8 | 10 | YOU SMELL POISON, WATCH OUT! |
| 4 | 10 | 5 | 8 | 10 | THIS MONSTER LOOKS DISEASED! |
| 5 | 30 | 50 | 50 | 55 | YOU FOUND ME! CAN YOU BEAT ME? |
| 6 | 15 | 10 | 10 | 15 | THIS IS AN AVERAGE JOE (JILL) |
| 7 | 20 | 8 | 16 | 55 | LOOK OUT! THIS ONE IS FAST! |
| 8 | 24 | 40 | 22 | 5 | RUN AWAY! THIS ONE IS NASTY! |
| 9 | 15 | 10 | 10 | 13 | THIS ONE DRAINS EXPERIENCE! |
| 10 | 40 | 15 | 20 | 5 | THIS ONE IS MASSIVELY ARMORED! |
| 11 | 12 | 50 | 17 | 25 | THIS CRITTER'S WEAPON IS EVIL! |
| 12 | 30 | 15 | 20 | 5 | THIS ONE BREATHES FIRE! |
| 13 | 20 | 15 | 30 | 5 | THIS ONE BREATHES ICE! |
| 14 | 20 | 38 | 26 | 45 | THIS IS A POWERFUL MONSTER! |
| 15 | 10 | 5 | 8 | 10 | THIS CREATURE DRAINS STRENGTH! |

### 4.3 The 22 built-in monsters (exe DS:4fc9) and the section monsters

| # | name | type | special | note |
|--:|---|--:|---|---|
| 0 | GIANT GARBAGE CAN | 0 | exp ×3 | |
| 1 | GIANT BALL | 1 | exp ×3 | |
| 2–7 | LT. BLUE / LIGHT RED / LT. GREEN / YELLOW / WHITE / GRAY PUFFBALL | 2 | +1 STR / INT / WIS / CON / AGI / LUCK | no XP, vanish when they "hit" |
| 8–13 | SKY BLUE / DARK RED / DK. GREEN / BROWN / BLACK / DK. GREY PUFFBALL | 2 | −1 STR / INT / WIS / CON / AGI / LUCK | |
| 14–17 | POISON FLASK, POISONED DRUGGIE, CHEMICAL BOMB, POISON TOXIC WASTE | 3 | poison, exp ×5 | |
| 18–21 | FLASK OF DISEASE, DISEASED DRUGGIE, BIOLOGICAL BOMB, CAN OF TOXIC WASTE | 4 | disease, exp ×5 | |

Types 22–26 are loaded from `MD.BIN` for the current section (22 = Shadow boss,
23–25 = regulars, 26 = the level drainer). The full 20-section table with each
monster's type, drain, breath and exp multiplier is in `monsters-mdbin.txt`
(generated by `parse_mdbin.py`). Highlights: every Shadow boss is type 5 with exp 15
(×16 XP) and `special = 100`, which `boss_immune_check` (3000:dab7) reads for Go Away,
Autokill, Drain Monster and Hold Monster, and `use_magic_item` (2000:b202) reads for
grenades; Sleep never asks. The Module V bosses also drain a level each hit.

### 4.4 Combat

The strike/defend formulas in the FAQ are mostly correct — I re-derived `strike()`
from the exe (2000:7e36) and it matches `UNF.CPP` line for line. The FAQ's monster
attack section has three errors, fixed in the v2.2 FAQ: the `d > level*4 → d = level`
line is a cap, not a floor; the 1/4 roll replaces the damage with `random(level/2+3)`
(can be 0) rather than an auto-hit; and the bonus damage / CON reduction only apply
when `level > lev`. Two details worth adding:
the monster's to-hit armor and dex both subtract from your hit roll, the weapon damage
die is rolled once per full 40 points your roll exceeds the target, and
`protection` spells subtract `2·prot²` from the monster's roll (Minor = 2, Protection
= 8, Major = 18, Ultra = 32).

Two more, from porting `defend()`:

* The **permanent plus on the armor being worn is never subtracted**. The roll takes off the
  armor's own AC bonus, the preparation Enchant Armor plus (0x7d3), body armor (0x7d4), the
  ring of protection (0x7d5) and the byte at 0xdd (`shield` in `UNF.CPP`, which nothing in the
  game writes), and that is all. A permanently enchanted suit therefore defends exactly as well
  as a plain one; the plus is only ever printed, and zeroed when acid breath destroys the suit.
* An **experience drainer always takes exactly 30**, the float 30.0 at DS:14df, whatever the
  monster's own `ldrain` says. That value is only what the message prints. Every experience
  drainer in the game holds -30, so the two have never disagreed on screen.

---

## 5. Magic

### 5.1 Rules (exe, 2000:e017 / 3000:e1b8)

* Casting from memory costs **(spell level) SP**: line 1 = 1 SP … line 10 = 10 SP.
  A permanent spell cast from the book also takes that same amount off **max SP**,
  forever. `cast_a_spell` (2000:e017) only does that on the from-memory path, so the
  same permanent spell cast from a scroll, a wand or a paper costs neither SP nor
  max SP.
* Scrolls, wands and papers consume one charge and no SP. Fighters can only use papers.
* Time passed: battle spells 10 s, preparation spells 100 s, permanent spells
  "a month" (36096 s, i.e. no in-dungeon time is charged).
* You may only own one of each spellbook; class gates: wizard-type books/scrolls are
  only usable by MONK/WIZARD/SAGE/MAGE, priest-type only by WORSHIPPER/MONK/PRIEST/SAGE
  (wands and papers have no class gate; FIGHTERs can only use papers). MONKs start
  with every spellbook set, so they can cast anything.
* Every battle spell that has a duration lasts **60 moves** (re-casting adds another
  60). Strength/Speed give +7 STR/+7 AGI and take it back when they expire.
* Anything that targets the monster fails on a Shadow boss (`special == 100`).

### 5.2 Effects

Permanent (type 0):

| L | slot 1 | slot 2 | slot 3 |
|--:|---|---|---|
| 1 | Enchant weapon → +1 | max HP +1 | write scroll (spell ≤ L3) |
| 2 | Enchant armor → +1 | max HP +3 | make wand, 5 charges (spell ≤ L3) |
| 3 | Enchant weapon → +2 | max HP +5 | ring of protection = 1 |
| 4 | Enchant armor → +2 | anti-magic ring = 1 | write scroll (≤ L10) |
| 5 | Enchant weapon → +3 | ring of protection = 2 | body armor = 1 |
| 6 | Enchant armor → +3 | anti-magic ring = 2 | make wand (≤ L8) |
| 7 | ring of protection = 3 | anti-magic ring = 3 | body armor = 2 |
| 8 | Enchant weapon → +4 | Enchant armor → +4 | make wand (any level) |
| 9 | feather = permanent | anti-magic ring = 5 | max HP +25 |
| 10 | invisibility = permanent | **Youth**: age = 20, `exp *= 0.9` | body armor = 4 |

"Enchant" sets the plus of one weapon/armor you pick to that value (it does not add);
rings/body armor refuse to cast if you already have that value or better. The
anti-magic ring does not appear in any combat formula I found (see §10).

Preparation (type 1):

| L | slot 1 | slot 2 | slot 3 |
|--:|---|---|---|
| 1 | temp armor +1 | temp weapon +1 | Little cure: `hp += wis/2` |
| 2 | temp weapon +2 | Relocate (random open square, same level) | Detect level |
| 3 | Cure: `2·Random(wis) + 20`, max 60 | temp armor +2 | Strength +5 (until rest) |
| 4 | temp weapon +3 | Agility +5 | Descend 1 (not past the module bottom) |
| 5 | Ascend 1 (fails deeper than 65) | Detect position | Feather |
| 6 | Big cure: `Random(4·wis) + 50`, max 150 | Double ascend (−2) | temp weapon +4 |
| 7 | Invisibility | temp armor +3 | Fast move |
| 8 | Super strength +10 | temp weapon +5 | Major descend (+10, capped at bottom) |
| 9 | Super agility +10 | Cure poison | Heal all wounds |
| 10 | Major ascend (−10, not from deeper than 65) | Cure disease | temp armor +4 |

Module bottoms: 25, 45, 65, 85, 105. Temporary pluses last until you rest at an inn.

Two of these do less than the table suggests:

* **Feather** zeroes the character's own body weight and nothing else. `compute_weight`
  (2000:41ae) sets the loaded weight to the body weight, replaces that with 0 when the
  feather flag is set, and then adds on every weapon and every suit of armor the character
  owns — so a feathered character still carries the full weight of their gear.
* **Major descend** is not refused on the bottom floor of a module: the depth test only
  refuses a floor deeper than the bottom, and the cap then leaves the floor number where it
  was. Cast down there the spell succeeds, drops no floors, and still puts the character on
  a random open square of the same floor.

Wizard battle (type 2):

| L | slot 1 | slot 2 | slot 3 |
|--:|---|---|---|
| 1 | Sleep: works if `Random(Lm) < 3` (25 moves) | Magic zap: `2·lev + 2` dmg | Minor protection (1) |
| 2 | Slow enemies (60 moves) | Strength +7 | Minor shock: 25 |
| 3 | Lightning: `4·lev + 4` | Magic missile: 50 | Speed +7 AGI |
| 4 | Go away: monster teleported, always | Relocate | Power weapon I (129-die) |
| 5 | Minor explosion: `Random(101)+75` | Protection (2) | Resist poison |
| 6 | Magic zot: Σ over lev+1 of `Random(5)+4` | Shock: 125 | Anti-cold |
| 7 | Explosion: `Random(101)+125` | Pass wall | Anti-fire |
| 8 | Magic bolt: Σ over lev+1 of `Random(5)+7` | Resist level drain | Power weapon II (199-die) |
| 9 | Hold monster (15 moves) | Drain monster | Major shock: 300 |
| 10 | Major explosion: `Random(301)+200` | Autokill | Power weapon III (399-die) |

Priest battle (type 3):

| L | slot 1 | slot 2 | slot 3 |
|--:|---|---|---|
| 1 | Sleep | Minor protection (1) | Strength +7 |
| 2 | Resist poison | Speed +7 | Fast cure: `hp += wis/2` |
| 3 | Resist disease | Relocate | Slow enemies |
| 4 | Anti-cold | Go away | Power weapon I |
| 5 | Protection (**1**, same as minor — looks like a bug) | Anti-fire | Pass wall |
| 6 | Resist level drain | Drain monster | Fast big cure: `Random(4·wis) + 20`, max 90 |
| 7 | Hold monster | Power weapon II | Shock: 125 |
| 8 | Major protection (3) | Explosion | Magic zot |
| 9 | Autokill | Power weapon III | Strength and speed |
| 10 | Ultra protection (4) | Fast heal: `hp = max` | Major shock: 300 |

Special rolls:

* **Autokill** (3000:dc18): succeeds if
  `Random(Lm + Random(mdex)) < Random(lev + Random(iq + wis)) + Random(level)`,
  where `mdex` is the monster type's dex from §4.2. Success sets the monster's HP to −100.
* **Drain monster** (3000:df41): if `Lm < wis` the monster's level and HP go to 0
  (instant kill); otherwise `Lm −= wis` and `hp −= (mhp/2)·wis`.
* **Go away** has no level-ratio check at all despite the help text; it always works
  on a non-boss.
* **Sleep** puts `stop_monster = 25`; **Hold** puts `hold_monster = 15`. Each monster
  attack decrements them and, with probability `level/500`, breaks them early.
* Slow enemies sets `slow_monster = 60`; the help text says it halves the monsters'
  attack rate, and the timing code that consumes the flag is in the unrecovered
  movement module, so I have not verified the exact factor.

---

## 6. File formats

### 6.1 Character files `20`..`29` (and the checksum)

2695-byte struct (`sizeof(pc)`) + 2 checksum bytes = 2697. The checksum, from
`save_player()` in the source and confirmed on all 12 of your files, is

```
a = c = 0 (8-bit)
for each of the 2695 bytes: a += byte; c += a - (a*a)
file[2695] = a; file[2696] = c
```

so a hand-edited save just needs `unfsave.py <file> --fix`. Field map (offsets in
the file; `unfsave.py` decodes all of it):

| offset | type | field |
|--:|---|---|
| 0x000 | char[40] | name |
| 0x028 / 0x029 / 0x02a | byte | race / sex (0 male) / class |
| 0x031 / 0x033 | int16 | hp / max hp |
| 0x035 / 0x039 | float | sp / max sp |
| 0x03d | int16 | height / 4 (inches) |
| 0x03f / 0x041 | int16 | naked weight / carried weight |
| 0x081 | byte[8] | weapons owned, count per weapon index (0 fist … 7 great sword) |
| 0x08e | byte[8] | weapon plus per index |
| 0x09b | byte | weapon in hand |
| 0x0b0 / 0x0b8 / 0x0c0 | byte[8] / byte[8] / byte | armor owned / armor plus / armor worn (0 skin … 6 titanium) |
| 0x15d | byte[6] | potions: green, orange, yellow, red, blue, white |
| 0x177 | byte[180] | spellbooks known, index = type·45 + (level−1)·3 + slot (15 levels reserved per type, 10 used; monks start with all of them set, every other non-fighter with Little Cure, wizard/sage/mage also Magic Zap, worshipper/priest/sage also priest Strength) |
| 0x22b | byte[180] | scrolls (count), same indexing |
| 0x2df | byte[180] | wand charges |
| 0x393 | byte[180] | spell papers (count) |
| 0x454 / 0x458 | int32 | rubles in pocket / in bank |
| 0x464 / 0x468 / 0x46c / 0x470 | int32 | culture stock / children helped / magic crystals / American dollars |
| 0x7a4 | double | experience |
| 0x7ac | int16 | character level |
| 0x7ae | int16 | facing (0 N, 1 S, 2 W, 3 E) |
| 0x7b0 / 0x7b2 / 0x7b4 / 0x7b6 | int16 | x / y / dungeon level / module (0..4) |
| 0x7b8 / 0x7b9 | byte | map cursor offsets |
| 0x7c4 | int32 | realtime (28800 per inn stay) |
| 0x7ca–0x7cd | byte | regen rings, lucky charms, grenades, stones of seeing |
| 0x7ce / 0x7d0 | int16 | disease / poison countdown (450 when caught, −1 cured) |
| 0x7d2–0x7d9 | byte | temp weapon+, temp armor+, body armor, prot ring, anti-magic ring, feather, fast move, invisible (100 = permanent) |
| 0x7da | int32 | age |
| 0x7de–0x7e1 | byte | prep Strength/Agility/Super strength/Super agility in effect |
| 0x7e2 / 0x7e4 / 0x7e6 | int16 | battle Strength / Speed / Slow-enemies moves left |
| 0x7e8 / 0x7e9 | byte / int16 | power weapon level / moves left |
| 0x7eb / 0x7ec | byte / int16 | protection level / moves left |
| 0x7ee–0x7fa | int16×7 | resist poison, resist disease, anti-cold, anti-fire, resist drain, stop (sleep), hold |
| 0x802 | byte | floor slosher |
| 0x812 / 0x814 | int16 | potions of healing / stones of teleportation |
| 0x816–0x820 | int16×6 | STR, INT, WIS, CON, AGI, LUCK |
| 0x822 | byte[36] | trapdoor keys, index = depth/5 |
| 0x849 | byte[5] | bosses beaten, one bit per section, per module |
| 0x853 | byte | gauntlet plus |
| 0x855 / 0x8a5 | byte[80] each | remembered boss x / y per module & section |
| 0x8f6 | byte | difficulty (1 = I can handle anything) |
| 0x8f9 | int16 | deepest level reached |

Unlabelled bytes are zero in every file I looked at, or are display settings.

### 6.2 `?##.DUN` explored maps

Name: `[slot][quarter][module].dun` — slot `'0'+charnum` ('D'..'M' for files 20..29),
quarter = level/32, module 0..4. Contents: 4 bytes of level bitmask (stored as
key[3],key[2],key[1],key[0]; bit `l%8` of key[l/8] = level `quarter*32+l` present),
then per present level a 16-byte row bitmask (110 rows) followed by 10 bytes per
present row = 80 bits of "player has stood here". The file only records exploration;
the dungeon itself is regenerated from `myrand(x, y, level, module, range)`, a hash
of the coordinates (the source calls it for walls, ladders, chutes, trap doors and
town buildings), which is why the layout is identical every game. Decoding `myrand`
would let you render a full map — it lives in the unrecovered DISP module
(segment 4000 in the Ghidra project) and I did not get to it. `001.dun`/`011.dun`
are what the intro/demo writes with character number 0.

### 6.3 `?MON.MAP`

3 bytes (`mao0, mao1, mao2` = the levels of the three arrays, −1 = unused), then
3 × 145 × 6-byte monster records `[x, y, hp lo, hp hi, type, level]` — the current
level and the last two visited. `parse_dun.py` dumps it.

### 6.4 `MD.BIN`

Repeated 20 times (one per section): 5 monster records of 29 bytes
(`name[19], picnum, color_set, ldrain, chrdrain, breath, special, type, int16 exp,
color`) then 24 text lines read with `fgets(40)`: 4 section-intro lines and 20
description lines. `parse_mdbin.py` prints the whole thing. `ldrain` −30 means
"drains 30 XP" (Sustrontima); `breath` 1 fire, 2 ice, 3 acid (destroys your armor),
4 disease, 5 poison; `special` 1 poison, 2 disease, 6 puffball, 100 boss.

### 6.5 Others

* `UNFDUNG.BIN` — `dwall[25][2][2][8][16]`, 12800 bytes of wall-drawing tiles.
* `UH.BIN` — hint text, 8 lines per hint, `give_hint(n)` reads lines 8n..8n+7
  (`hint.py`), 138 hints. `UH2.BIN` — the stone-tablet text, 4 lines per message, 86 of them,
  read the same way by `tablet_message` 3000:931c: town greetings, level-up congratulations,
  the "message from the office of" taunts and the notes under a monster.
* `*.UHP` — the F1 help screens, read by `read_help_screen` 3000:7c6d.  A letter of `rgbynow`
  anywhere in the text is a colour code rather than a character; `e` ends a page, and a second
  `e` ends the file where anything else (the files use `X`) starts the next page.
* `USPELLS.HLP` — 120 `~`-terminated spell descriptions in type/level/slot order.
* `UROLL.TXT` — character-creation text, fixed line counts per screen.
* `*.PIC` — decoded: a sequence of 256x200 run-length images with a 201-entry row table and
  5-bit colour indices; palettes and colour rules in `PICTURES.md` (handoff bundle),
  decoders `unfpic.py` / `dotu-pic.js`.  `*.FNT` — not analysed.

---

## 7. Static item tables (exe)

Weapons (DS:01a0):

| # | name | damage die | to-hit | time | weight |
|--:|---|--:|--:|--:|--:|
| 0 | FIST | 2 | +0 | 6 | 0 |
| 1 | STICK | 4 | +1 | 9 | 4 |
| 2 | CLUB | 7 | +2 | 13 | 7 |
| 3 | MACE | 12 | +3 | 18 | 11 |
| 4 | KNIFE | 3 | +0 | 8 | 1 |
| 5 | SHORTSWORD | 5 | +1 | 11 | 3 |
| 6 | LONG SWORD | 9 | +2 | 16 | 6 |
| 7 | GREAT SWORD | 19 | +3 | 25 | 15 |
| 8 | POWER WEAPON 1 | 69 | +4 | 8 | 0 |
| 9 | POWER WEAPON 2 | 129 | +6 | 8 | 0 |
| 10 | POWER WEAPON 3 | 199 | +10 | 8 | 0 |
| 11 | POWER WEAPON 4 | 399 | +20 | 8 | 0 |

(`strike()` indexes this table with `8 + power_weapon`, so Power weapon I swings row 9 and
Power weapon III swings row 11: every level gets the row after the one it is named for, the
to-hit and time columns of these four rows are never read, and row 8 is unreachable.)
Armor (DS:01f4):

| # | name | AC bonus | time | weight |
|--:|---|--:|--:|--:|
| 0 | SKIN | 0 | 0 | 0 |
| 1 | LEATHER | 2 | 1 | 14 |
| 2 | CHAIN | 4 | 2 | 24 |
| 3 | SCALE | 6 | 3 | 40 |
| 4 | BREAST PLATE | 9 | 4 | 60 |
| 5 | FIELD PLATE | 12 | 5 | 72 |
| 6 | TITANIUM | 16 | 4 | 48 |

Class restrictions (source, `movecontrol`): WORSHIPPER and WIZARD can only wear
skin; MONK and SAGE only skin or leather. WORSHIPPER and MONK fight with fists only;
WIZARD and SAGE may use fist, stick or knife; only FIGHTERs may use the great sword.

---

## 8. What the clock feeds

`srand` (exe 1000:18a5) takes a 16-bit seed, puts it in the low word of the generator's
state and zeroes the high word.  `rand` (exe 1000:18b6) advances that state by
`state = state * 0x015A4E35 + 1` and hands back `(state >> 16) & 0x7fff`.  Nothing in the
game draws from one long run of that generator: it is reseeded constantly, from two
different clocks.

* `clock()` (exe 1000:11b4) is the BIOS tick counter read with INT 1Ah — 18.2 ticks a
  second — less the reading taken at start-up, plus a day's worth of ticks for each
  midnight crossed.
* `time()` (exe 1000:1d12) is the DOS date and time turned into seconds.  `srand` keeps
  only the low 16 bits of it, so a seed taken from it changes once a second.

### 8.1 `Random` reseeds on every call

`Random(n)` (exe 2000:4156) is the game's only wrapper around `rand`, and it is not a
wrapper that keeps a sequence going.  Every call does this:

```
clock()                       ; 2000:415c
srand(DS:c609 + clock())      ; 2000:4168
DS:c609 += clock()            ; 2000:4170, a second reading of the clock
return rand() * n / 0x8000    ; 2000:418c
```

The multiply and the divide are 32-bit and signed and truncate toward zero, so `Random(n)`
is an integer in 0..n-1.  `Random(0)` is 0, and a negative `n` gives a value between
`n + 1` and 0, because nothing clamps the multiply.

`DS:c609` is a running total.  `main` starts it at `rand() * 2000 / 0x8000` off a
`srand(time())` (2000:63bd, the roll at 2000:63cc), and every `Random` call adds another
clock reading to it.  So the seed a `Random` roll gets is the clock plus a number that
grows by about the clock again on every roll.

Everywhere else the game writes the same arithmetic inline — `rand() * n / 0x8000`, with
no reseed of its own — and that is the distinction that matters to anyone modelling the
clock: an inline roll carries on from whatever the last reseed set, while a `Random` roll
starts a new sequence from the clock.  `strike` is eight inline rolls and no `Random`
call; `spell_effect` is sixteen `Random` calls and no inline roll; most routines are a
mix of the two.

### 8.2 Every reseed in the game

| routine | `srand` at | seed | what rolls before the next reseed |
|---|---|---|---|
| `Random` (2000:4156) | 2000:4168 | `DS:c609 + clock()` | one `rand` (2000:418c), which is the value it returns |
| `main` (2000:620f) | 2000:63bd | `time()` | one `rand` (2000:63cc), scaled to 0..1999, which starts `DS:c609` |
| `stock_level` (2000:671e) | 2000:6737 | `time()` | the boss placement: one inline roll (2000:68ff) and one `Random` (2000:6939) |
| `stock_level` (2000:671e) | 2000:6979 | `clock() + slot + attempt` | the slot's x and y, `rand * 80` and `rand * 110` (2000:6988 and 2000:69bc), and then a fresh reseed for the next attempt |
| `strike` (2000:7e36) | 2000:7e63 | `clock()` | the whole swing: the to-hit roll at 2000:7e89 and seven more inline rolls |
| `defend` (2000:82b7) | 2000:84ca | `clock() + 100` | nothing at all — the next roll is `Random(80)` at 2000:84ee, which reseeds before it rolls, so this seed never reaches a die |
| `trapdoor_dest` (2000:bda6) | 2000:bdb2 | 10, then 11, 12, … | the landing square, `rand * 60 + 10` and `rand * 90 + 10`, tried again with the next seed until the square is open |
| `roll_char` (3000:4c77) | 3000:5447 | `time()` | every roll a character is made of |
| `drop_money` (4000:6aca) | 4000:6b24 | `time()` | the whole money drop, eleven inline rolls |
| `FUN_3000_8d7e` (3000:8d7e) | four of them | `param * 5 + 4`, then three from `time()` | nothing in the game calls this function |

### 8.3 What the reseeding does to play

Borland's generator answers consecutive seeds with numbers that climb in a straight line:
one more on the seed is 346 more out of `rand`, out of the 32768 it can return.  A value
scaled to 0..79 therefore climbs about 0.85 for every tick of the clock and wraps every 95
ticks, which is 5.2 seconds.

* `strike`'s to-hit roll is the first `rand` after `srand(clock())`, so it is that
  sawtooth exactly: there are good moments to swing and bad ones, on a five-second cycle.
  The seven rolls after it carry on from the same seed and move fast enough to look
  random.
* `defend`'s to-hit roll is a `Random` call, so the `clock() + 100` above it is thrown
  away and what the monster rolls depends on `DS:c609` as well as on the clock.  There is
  no sawtooth a player could learn.
* `stock_level` reseeds once per placement attempt with the slot number inside the seed,
  which is why consecutive slots land a fixed distance apart and a freshly stocked floor
  holds its monsters in diagonal stripes (§4.1).
* `roll_char` and `drop_money` take one `time()` seed and roll everything off it, and
  `time()` only changes once a second.  Two rollers started in the same second make the
  same character, and two monsters of the same floor killed in the same second drop the
  same money.

`TIDBITS.md` section "Random numbers that are not random" writes the first and the third of
these up, and the Tidbits tab has the first as "Swing on the beat".

### 8.4 Which rolls go through `Random`

Every call to `Random` (2000:4156) and every inline `rand` (1000:18b6) in the game's own code
segments — 2000 WORLD, 3000 TOWN/MAGICFNC/CAT, 4000 DISP — read out of the instruction stream of
the unpacked executable rather than out of the decompilation, because Ghidra's C loses a call here
and there (§METHOD 8 is how the instructions are printed).  Fifty calls go through `Random` and
162 rolls are written inline.  `Random`'s own `rand` at 2000:418c is left out of both counts: it
is the value `Random` hands back.  Routines that roll nothing are left out of the table, and
nothing in segments 5000 and up rolls at all.

| routine | `Random` calls | inline rolls | where the `Random` calls are |
|---|---|---|---|
| `FUN_2000_31bc` (2000:31bc) | 0 | 2 | — |
| `temple` (2000:4d39) | 0 | 5 | — |
| `main` (2000:620f) | 0 | 1 | — |
| `get_mtype` (2000:65f8) | 1 | 7 | 6601 |
| `stock_level` (2000:671e) | 1 | 11 | 6939 |
| `FUN_2000_77ae` (2000:77ae) | 0 | 1 | — |
| `FUN_2000_7800` (2000:7800) | 0 | 1 | — |
| `FUN_2000_7832` (2000:7832) | 0 | 1 | — |
| `strike` (2000:7e36) | 0 | 8 | — |
| `defend` (2000:82b7) | 3 | 12 | 84ee 8817 8902 |
| `FUN_2000_9232` (2000:9232) | 1 | 0 | 9248 |
| `call_check_eng` (2000:a319) | 0 | 1 | — |
| `pass_moment` (2000:a53c) | 0 | 4 | — |
| `use_magic_item` (2000:b202) | 2 | 0 | b2b9 b2cd |
| `attack_timing` (2000:b8f7) | 1 | 2 | b9a6 |
| `FUN_2000_bce5` (2000:bce5) | 0 | 1 | — |
| `trapdoor_dest` (2000:bda6) | 0 | 2 | — |
| `movecontrol` (2000:c308) | 1 | 2 | dd45 |
| `draw_3d_view` (3000:0f75) | 0 | 3 | — |
| `roll_char` (3000:4c77) | 0 | 13 | — |
| `random_events_tick` (3000:6e85) | 1 | 2 | 6ed2 |
| `FUN_3000_8d7e` (3000:8d7e) | 0 | 4 | — |
| `title_screen` (3000:99bf) | 4 | 5 | 9e1e 9e33 9f02 9f17 |
| `drop_weapon` (3000:a1fc) | 0 | 2 | — |
| `drop_armor` (3000:a3d7) | 0 | 2 | — |
| `drop_spellbook` (3000:a65d) | 2 | 4 | a68a a6a9 |
| `drop_scroll` (3000:a870) | 1 | 4 | a8a0 |
| `drop_wand` (3000:aa37) | 1 | 6 | aa5b |
| `drop_paper` (3000:ac6f) | 1 | 5 | ac8c |
| `find_item` (3000:ae27) | 0 | 1 | — |
| `post_kill_heal` (3000:afc5) | 0 | 3 | — |
| `post_kill_sp` (3000:b063) | 0 | 1 | — |
| `kill_monster` (3000:b12d) | 1 | 5 | b4c2 |
| `go_up_level` (3000:bd9a) | 0 | 7 | — |
| `go_down_level` (3000:c093) | 0 | 7 | — |
| `explosion` (3000:d818) | 3 | 0 | d864 d87a d890 |
| `sleep_monster` (3000:d904) | 1 | 0 | d93c |
| `relocate` (3000:da2c) | 2 | 0 | da47 da56 |
| `go_away` (3000:db1e) | 2 | 0 | db7d db9c |
| `autokill` (3000:dc18) | 5 | 0 | dc83 dc8f dca0 dcaf dcbc |
| `spell_effect` (3000:e1b8) | 16 | 0 | e60e e721 e730 e7ff e80e e976 ea37 ea46 ebb2 ebc1 ecfa ed09 f083 f1c8 f4e7 f625 |
| `set_palette` (4000:12c3) | 0 | 16 | — |
| `drop_money` (4000:6aca) | 0 | 11 | — |
| **total** | **50** | **162** | |

`main`'s single inline roll, at 2000:63cc, is the one that starts `DS:c609` rather than a roll of
play; §8.1 has it.  `FUN_3000_8d7e`'s eight are unreachable, since nothing calls that function.

`spell_effect`'s sixteen are five spells and five landings: `Random(wis)` at e60e and
`Random(wis * 4)` at e976 and f4e7 are the three cures, `Random(5)` at f083, f1c8 and f625 are the
missile loops of Magic Zot (twice — it is in both battle lists) and Magic Bolt, and the five pairs
e721/e730, e7ff/e80e, ea37/ea46, ebb2/ebc1 and ecfa/ed09 are `Random(79)` and `Random(104)`, the
square each of the five floor-changing spells drops the character on.

### 8.5 Where the port rolls them

Every roll site in `src/lib/game/port/` and `src/lib/play/` that plays Dungeons of the Unforgiven,
against the calls above.  A `Random` roll goes through `Game.randomCall`, which reseeds from the
clock when the game has one; an inline roll goes through `Game.rng.random`, which reseeds
nothing.

| port | plays | `Random` | inline |
|---|---|---|---|
| `character.ts` `rollCharacteristics`, `rollChar` | `roll_char` | 0 | 13 |
| `combat.ts` `strike` | `strike` | 0 | 8 |
| `combat.ts` `defend` | `defend` | 2 (84ee 8817) | 12 |
| `combat.ts` `breathe` | `defend`'s breath | 1 (8902) | 0 |
| `combat.ts` `callCheckEng` | `call_check_eng` | 0 | 1 |
| `combat.ts` `attackTiming` | `attack_timing` | 1 (b9a6) | 2 |
| `combat.ts` `goDownLevel` | `go_down_level` | 0 | 7 |
| `drops.ts` `dropWeapon` | `drop_weapon` | 0 | 2 |
| `drops.ts` `dropArmor` | `drop_armor` | 0 | 2 |
| `drops.ts` `dropSpellbook` | `drop_spellbook` | 2 (a68a a6a9) | 4 |
| `drops.ts` `dropScroll` | `drop_scroll` | 1 (a8a0) | 4 |
| `drops.ts` `dropWand` | `drop_wand` | 1 (aa5b) | 6 |
| `drops.ts` `dropPaper` | `drop_paper` | 1 (ac8c) | 5 |
| `drops.ts` `findItem` | `find_item` | 0 | 1 |
| `drops.ts` `postKillHeal` | `post_kill_heal` | 0 | 3 |
| `drops.ts` `postKillSp` | `post_kill_sp` | 0 | 1 |
| `drops.ts` `dropMoney` | `drop_money` | 0 | 11 |
| `drops.ts` `useMagicItem` | `use_magic_item` | 2 (b2b9 b2cd) | 0 |
| `hints.ts` `hintOnArrival` | `FUN_2000_31bc` | 0 | 2 |
| `kills.ts` `drainerBonus`, `killMonster` | `kill_monster` | 1 (b4c2) | 5 |
| `kills.ts` `playerDies` | `FUN_2000_9232` | 1 (9248) | 0 |
| `levels.ts` `goUpLevel` | `go_up_level` | 0 | 7 |
| `magic.ts` `explosion` | `explosion` | 3 | 0 |
| `magic.ts` `sleepMonster` | `sleep_monster` | 1 | 0 |
| `magic.ts` `relocateSpell` | `relocate` | 2 | 0 |
| `magic.ts` `goAway` | `go_away` | 2 | 0 |
| `magic.ts` `autokill` | `autokill` | 5 | 0 |
| `magic.ts` `cure`, `bigCure`, `fastBigCure` | `spell_effect` e60e e976 f4e7 | 3 | 0 |
| `magic.ts` `magicZot`, `magicBolt` | `spell_effect` f083 f625 f1c8 | 2 | 0 |
| `magic.ts` `changeFloorTo` | `spell_effect`'s five landings | 2 | 0 |
| `moment.ts` `passMoment` | `pass_moment` | 0 | 4 |
| `moment.ts` `arriveSquare` | `FUN_2000_bce5` | 0 | 1 |
| `moment.ts` `relocate` | `relocate` | 2 | 0 |
| `town.ts` `temple` | `temple` | 0 | 5 |
| `play/floor.ts` `fractions` | `stock_level`'s rolls | 0 | 1 |
| `play/move.ts` `resolveStep` | `movecontrol` | 1 (dd45) | 2 |

Four of those rows are not one port site per call of the game.  `magicZot` is one function for
both of the game's copies of the spell, and `changeFloorTo` is one pair of rolls for all five
landings, so eleven of `spell_effect`'s sixteen calls are played by seven sites.  `relocate` is
ported twice over, once in `moment.ts` and once in `magic.ts`, so two calls of the game have four
sites.  And `play/floor.ts`'s `fractions` is not one roll but the whole of `stock_level`: the
stocking in `src/lib/map/stocking.ts` draws fractions rather than rolls, so its twelve calls have
no site of their own here.  `play/floor.ts`'s `squareReseed` is the srand at 2000:6979 that stands
over two of those twelve, the slot's x and y, and a game with a clock hands it in.

What the port has no site for: `get_mtype` and `stock_level` (a floor is stocked through
`fractions` above), `random_events_tick` and `title_screen`, `set_palette`'s palette fade,
`FUN_2000_77ae`, `FUN_2000_7800`, `FUN_2000_7832` and the unreachable `FUN_3000_8d7e`.
`trapdoor_dest`'s two rolls are in `src/lib/game/unfmap.js`, which is a verbatim copy of the
reference bundle rather than part of the port, and `draw_3d_view`'s three coin flips are the
mirrored wall faces, which `src/lib/play/view3d/render.ts` draws from a fraction the scene carries.

---

## 9. Files in this folder

* `UNFORGIVEN-RE-NOTES.md` — this document.
* `tools/unfsave.py` — decode / re-checksum character files.
* `tools/parse_mdbin.py`, `tools/parse_dun.py`, `tools/hint.py` — data file parsers.
* `monsters-mdbin.txt` — full monster table from your `MD.BIN`.
* `unpacked/unf.000.exe` — PKLITE-unpacked `unf.exe` (deark); `unf_fp.exe` with the
  Borland 80x87-emulator interrupts (`INT 34h–3Dh`) rewritten to real FPU opcodes;
  `unf_pages.exe` re-laid-out so every segment starts on a 64 KB page (Ghidra's
  x86-16 near-jump resolution is page-relative, which silently broke half the
  functions until I did this). All are for analysis only, none of them run.
* `decomp/decomp_all.c` — Ghidra's C for all 647 functions of `unf_pages.exe`
  (segment 2000 = WORLD/`UNF.CPP`, 3000 = TOWN+MAGICFNC+CAT, 4000 = DISP, 1000 =
  Borland runtime; data segment 6000). `functions.txt` lists them with callers.
* `ghidra-scripts/` — the Jython scripts that set it up (analyzer options, Borland
  runtime signatures, jump-table overrides, export), plus `unemu87.py` and
  `relayout.py`.

## 10. Not done / open questions

* `myrand()` and the dungeon generator (walls, doors, ladders, chutes, trap door
  destinations) — the biggest remaining prize; it would give a complete map viewer.
* `roll_char()` and the character-design screen (decompiler still fails on it; the
  FAQ's starting-stat formulas look right).
* The anti-magic ring: stored and displayed, but I found no code that reads it in
  combat or spell resolution.
* `.FNT` font format (`.PIC` is done, see `PICTURES.md`).
* Monster movement is read (`pass_moment` 2000:a53c: a monster within Manhattan distance
  `level/10 + 10` steps toward you 4 times in 5, x-axis first; Fast Move and Invisibility
  each skip the whole moment 1 time in 4); the engagement timers (2000:b782 / b8f7) are
  still unread.
