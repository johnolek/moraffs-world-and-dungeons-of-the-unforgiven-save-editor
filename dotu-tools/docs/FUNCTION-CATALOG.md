# Function catalog for unf.exe (1993 registered build, page-relaid Ghidra layout)

Addresses are Ghidra's view of the re-laid-out executable: segment 1000 = Borland runtime,
2000 = WORLD (the recovered UNF.CPP), 3000 = TOWN/MAGICFNC/CAT, 4000/5000+ = DISP and video
drivers, 6000 = data.  647 functions; 199 identified.  Names are ours, not the original symbols,
except where UNF.CPP gave them.  See METHOD.md for how the identifications were made.

| address | name | size | purpose | module | callers |
|---|---|---:|---|---|---|
| 1000:0000 | c0 startup | 355 | runtime entry: sets up DS/SS, calls main | Borland runtime / libc |  |
| 1000:0163 | FUN_1000_0163 | 19 |  | Borland runtime / libc | FUN_1000_1466 |
| 1000:0176 | FUN_1000_0176 | 40 |  | Borland runtime / libc | FUN_1000_1466 |
| 1000:019e | FUN_1000_019e | 18 |  | Borland runtime / libc | FUN_1000_1466 |
| 1000:01b0 | FUN_1000_01b0 | 67 |  | Borland runtime / libc | entry |
| 1000:01f3 | FUN_1000_01f3 | 45 |  | Borland runtime / libc | FUN_1000_1466 |
| 1000:0220 | FUN_1000_0220 | 68 |  | Borland runtime / libc | FUN_1000_0220, entry |
| 1000:0264 | FUN_1000_0264 | 65 |  | Borland runtime / libc | FUN_1000_0163, FUN_1000_0264 |
| 1000:02a5 | FUN_1000_02a5 | 8 |  | Borland runtime / libc | FUN_1000_0176, FUN_1000_02ad |
| 1000:02ad | FUN_1000_02ad | 63 |  | Borland runtime / libc | FUN_1000_0d04, entry |
| 1000:051c | FUN_1000_051c | 4 |  | Borland runtime / libc | FUN_5120_2714 |
| 1000:0520 | FUN_1000_0520 | 154 |  | Borland runtime / libc | FUN_1000_0a80 |
| 1000:05ba | FUN_1000_05ba | 33 |  | Borland runtime / libc | FUN_1000_05db |
| 1000:05db | FUN_1000_05db | 399 |  | Borland runtime / libc | thunk_FUN_1000_05db |
| 1000:076a | FUN_1000_076a | 5 |  | Borland runtime / libc |  |
| 1000:076f | FUN_1000_076f | 43 |  | Borland runtime / libc | FUN_1000_0ea4, FUN_1000_1141 |
| 1000:079a | FUN_1000_079a | 734 |  | Borland runtime / libc |  |
| 1000:0a78 | FUN_1000_0a78 | 8 |  | Borland runtime / libc |  |
| 1000:0a80 | FUN_1000_0a80 | 118 |  | Borland runtime / libc |  |
| 1000:0af6 | FUN_1000_0af6 | 5 |  | Borland runtime / libc |  |
| 1000:0afb | FUN_1000_0afb | 52 |  | Borland runtime / libc | FUN_1000_05db |
| 1000:0d04 | FUN_1000_0d04 | 164 |  | Borland runtime / libc |  |
| 1000:0daa | FUN_1000_0daa | 201 |  | Borland runtime / libc | FUN_1000_0e73 |
| 1000:0e73 | FUN_1000_0e73 | 11 |  | Borland runtime / libc | FUN_1000_079a |
| 1000:0e7e | FUN_1000_0e7e | 38 |  | Borland runtime / libc | FUN_1000_10b1 |
| 1000:0ea4 | FUN_1000_0ea4 | 26 |  | Borland runtime / libc | FUN_3000_2822, FUN_3000_3311 |
| 1000:0ebe | FUN_1000_0ebe | 106 |  | Borland runtime / libc |  |
| 1000:0f28 | pow | 363 | libm pow(double, double), returns in ST0 | Borland runtime / libc | exp_needed, check_gain_level, gain_level, exp_value |
| 1000:10b1 | FUN_1000_10b1 | 144 |  | Borland runtime / libc | FUN_1000_0ebe, pow |
| 1000:1141 | FUN_1000_1141 | 26 |  | Borland runtime / libc | FUN_3000_27fc, FUN_3000_3311 |
| 1000:115b | ftol | 44 | float/double -> long conversion helper | Borland runtime / libc | reset_view_caches, FUN_2000_4054, store_refund, flea_inn, FUN_3000_0837, draw_3d_view … |
| 1000:1187 | FUN_1000_1187 | 45 |  | Borland runtime / libc |  |
| 1000:11b4 | FUN_1000_11b4 | 73 |  | Borland runtime / libc | Random, stock_level, strike, defend, movecontrol, FUN_3000_8fcc |
| 1000:11fd | FUN_1000_11fd | 169 |  | Borland runtime / libc | FUN_1000_3397 |
| 1000:12a6 | FUN_1000_12a6 | 253 |  | Borland runtime / libc | FUN_1000_3397 |
| 1000:13a3 | FUN_1000_13a3 | 29 |  | Borland runtime / libc | FUN_1000_182a |
| 1000:13c0 | FUN_1000_13c0 | 27 |  | Borland runtime / libc |  |
| 1000:13db | FUN_1000_13db | 51 |  | Borland runtime / libc | FUN_1000_195e |
| 1000:140e | FUN_1000_140e | 45 |  | Borland runtime / libc |  |
| 1000:143b | FUN_1000_143b | 19 |  | Borland runtime / libc | FUN_1000_195e |
| 1000:144e | FUN_1000_144e | 23 |  | Borland runtime / libc |  |
| 1000:1465 | FUN_1000_1465 | 1 |  | Borland runtime / libc | FUN_1000_1466, FUN_1000_3397 |
| 1000:1466 | FUN_1000_1466 | 87 |  | Borland runtime / libc | FUN_1000_14cc, exit |
| 1000:14bd | exit | 15 | libc exit | Borland runtime / libc | FUN_2000_0388, FUN_2000_03ae, FUN_2000_04b7, load_section_pictures, main, load_player … |
| 1000:14cc | FUN_1000_14cc | 18 |  | Borland runtime / libc | FUN_1000_02ad |
| 1000:14f8 | N_LXMUL | 23 | 32-bit multiply helper: DX:AX * CX:BX | Borland runtime / libc | FUN_2000_041b, FUN_2000_05da, FUN_2000_0923, FUN_2000_0fc5, FUN_2000_1d4f, FUN_2000_20db … |
| 1000:150f | FUN_1000_150f | 19 |  | Borland runtime / libc | FUN_1000_1d12 |
| 1000:1522 | FUN_1000_1522 | 19 |  | Borland runtime / libc | FUN_1000_1d12 |
| 1000:1535 | FUN_1000_1535 | 15 |  | Borland runtime / libc | FUN_2000_000d |
| 1000:1544 | FUN_1000_1544 | 17 |  | Borland runtime / libc |  |
| 1000:1555 | FUN_1000_1555 | 3 |  | Borland runtime / libc | FUN_1000_520a |
| 1000:1558 | N_LDIV | 4 | signed 32-bit divide (stack args, retf 8) | Borland runtime / libc | FUN_2000_041b, FUN_2000_05da, FUN_2000_0923, FUN_2000_0fc5, FUN_2000_1598, FUN_2000_1d4f … |
| 1000:155f | N_LUDIV | 5 | unsigned 32-bit divide | Borland runtime / libc | drop_money |
| 1000:1564 | FUN_1000_1564 | 3 |  | Borland runtime / libc | FUN_1000_520a |
| 1000:1567 | N_LMOD | 5 | signed 32-bit modulo | Borland runtime / libc | bank, module_transition_screen |
| 1000:156f | N_LUMOD | 1 | unsigned 32-bit modulo | Borland runtime / libc |  |
| 1000:1572 | FUN_1000_1572 | 145 |  | Borland runtime / libc | N_LDIV, N_LMOD, N_LUDIV |
| 1000:1603 | FUN_1000_1603 | 3 |  | Borland runtime / libc | FUN_1000_3070 |
| 1000:1606 | N_LXLSH | 30 | 32-bit shift left | Borland runtime / libc | FUN_2000_0fc5, FUN_2000_2268, FUN_2000_31bc, flea_inn, get_mtype, defend … |
| 1000:1627 | N_LXRSH | 29 | 32-bit arithmetic shift right | Borland runtime / libc | FUN_2000_0fc5, FUN_2000_1598, FUN_3000_00a8, FUN_3000_0837, draw_3d_view, draw_map_square … |
| 1000:1644 | FUN_1000_1644 | 77 |  | Borland runtime / libc | FUN_1000_3070 |
| 1000:16a4 | FUN_1000_16a4 | 40 |  | Borland runtime / libc | FUN_1000_30fb |
| 1000:16cc | FUN_1000_16cc | 57 |  | Borland runtime / libc | FUN_1000_1705, FUN_1000_17c2, FUN_1000_18dc, FUN_1000_1909, FUN_1000_1db7, FUN_1000_32c2 … |
| 1000:1705 | FUN_1000_1705 | 18 |  | Borland runtime / libc | FUN_1000_13a3, FUN_1000_13c0, FUN_1000_13db, FUN_1000_140e |
| 1000:1717 | FUN_1000_1717 | 17 |  | Borland runtime / libc | FUN_1000_405f |
| 1000:1728 | FUN_1000_1728 | 125 |  | Borland runtime / libc | FUN_1000_17a5, FUN_1000_1e45, FUN_1000_462c, ltoa, itoa |
| 1000:17a5 | FUN_1000_17a5 | 29 |  | Borland runtime / libc | FUN_1000_17eb |
| 1000:17c2 | FUN_1000_17c2 | 41 |  | Borland runtime / libc | FUN_1000_42da, FUN_1000_4342, FUN_1000_48cb, FUN_1000_4a13, FUN_1000_4bbb, FUN_1000_563a |
| 1000:17eb | FUN_1000_17eb | 63 |  | Borland runtime / libc | FUN_1000_182a, fclose |
| 1000:182a | FUN_1000_182a | 67 |  | Borland runtime / libc |  |
| 1000:186d | lmul32 | 23 | 32x32 multiply used by rand() | Borland runtime / libc | FUN_1000_2789, fread, fwrite, FUN_1000_50f1, FUN_1000_53da, rand |
| 1000:1884 | FUN_1000_1884 | 33 |  | Borland runtime / libc | FUN_1000_3031, FUN_1000_3070 |
| 1000:18a5 | srand | 17 | seed = value (32-bit) | Borland runtime / libc | Random, main, stock_level, strike, defend, trapdoor_dest … |
| 1000:18b6 | rand | 38 | seed = seed*0x015A4E35+1; return (seed>>16)&0x7fff | Borland runtime / libc | FUN_2000_31bc, Random, temple, main, get_mtype, stock_level … |
| 1000:18dc | FUN_1000_18dc | 45 |  | Borland runtime / libc | FUN_1000_415b, FUN_1000_4bbb |
| 1000:1909 | FUN_1000_1909 | 22 |  | Borland runtime / libc | null_check, load_level_screen, change_module |
| 1000:191f | FUN_1000_191f | 38 |  | Borland runtime / libc | FUN_1000_195e |
| 1000:1945 | FUN_1000_1945 | 25 |  | Borland runtime / libc | FUN_1000_195e |
| 1000:195e | FUN_1000_195e | 193 |  | Borland runtime / libc | FUN_1000_1a1f |
| 1000:1a1f | FUN_1000_1a1f | 350 |  | Borland runtime / libc | FUN_1000_1b7d, FUN_1000_1b91, FUN_1000_1bc4 |
| 1000:1b7d | FUN_1000_1b7d | 20 |  | Borland runtime / libc | FUN_1000_3397 |
| 1000:1b91 | FUN_1000_1b91 | 51 |  | Borland runtime / libc |  |
| 1000:1bc4 | FUN_1000_1bc4 | 51 |  | Borland runtime / libc |  |
| 1000:1bf7 | FUN_1000_1bf7 | 24 |  | Borland runtime / libc | int86 |
| 1000:1c0f | FUN_1000_1c0f | 19 |  | Borland runtime / libc | FUN_1000_1cda |
| 1000:1c22 | FUN_1000_1c22 | 19 |  | Borland runtime / libc | FUN_1000_1cda |
| 1000:1cda | FUN_1000_1cda | 56 |  | Borland runtime / libc |  |
| 1000:1d12 | FUN_1000_1d12 | 77 |  | Borland runtime / libc | main, stock_level, roll_char, drop_money |
| 1000:1d5f | FUN_1000_1d5f | 44 |  | Borland runtime / libc | movecontrol, FUN_3000_7dfc |
| 1000:1d8b | FUN_1000_1d8b | 44 |  | Borland runtime / libc | cast_a_spell, roll_char, monster_manual, typed_name, FUN_4000_580e, FUN_4000_593f |
| 1000:1db7 | FUN_1000_1db7 | 22 |  | Borland runtime / libc | fclose |
| 1000:1dcd | FUN_1000_1dcd | 7 |  | Borland runtime / libc | FUN_1000_1e45 |
| 1000:1dd4 | FUN_1000_1dd4 | 9 |  | Borland runtime / libc | FUN_1000_1dcd |
| 1000:1ddd | FUN_1000_1ddd | 8 |  | Borland runtime / libc | FUN_1000_1dd4 |
| 1000:1de5 | FUN_1000_1de5 | 26 |  | Borland runtime / libc | cputs, FUN_1000_4145, puts, FUN_1000_4fb2, FUN_1000_4fcf |
| 1000:1dff | FUN_1000_1dff | 13 |  | Borland runtime / libc | FUN_1000_1e45 |
| 1000:1e0c | FUN_1000_1e0c | 9 |  | Borland runtime / libc | FUN_1000_1e45 |
| 1000:1e15 | FUN_1000_1e15 | 48 |  | Borland runtime / libc | FUN_1000_1e45 |
| 1000:1e45 | FUN_1000_1e45 | 1059 |  | Borland runtime / libc | FUN_1000_1de5 |
| 1000:2298 | FUN_1000_2298 | 37 |  | Borland runtime / libc | FUN_1000_2444, FUN_1000_31f2, FUN_1000_3246, FUN_1000_342e |
| 1000:22bd | FUN_1000_22bd | 122 |  | Borland runtime / libc | FUN_1000_2444, FUN_1000_3889 |
| 1000:2337 | FUN_1000_2337 | 41 |  | Borland runtime / libc | FUN_1000_11fd, FUN_1000_12a6, FUN_1000_17eb |
| 1000:2360 | FUN_1000_2360 | 34 |  | Borland runtime / libc | FUN_1000_23b3, FUN_1000_34e8 |
| 1000:2382 | FUN_1000_2382 | 49 |  | Borland runtime / libc | FUN_1000_23bf, FUN_1000_35fa, FUN_1000_363a |
| 1000:23b3 | FUN_1000_23b3 | 12 |  | Borland runtime / libc |  |
| 1000:23bf | FUN_1000_23bf | 16 |  | Borland runtime / libc |  |
| 1000:23cf | clrscr | 41 | conio clear screen | Borland runtime / libc | main |
| 1000:23f8 | textcolor | 21 | conio text colour | Borland runtime / libc | show_registration_notice |
| 1000:240d | FUN_1000_240d | 25 |  | Borland runtime / libc |  |
| 1000:2426 | FUN_1000_2426 | 11 |  | Borland runtime / libc |  |
| 1000:2444 | FUN_1000_2444 | 293 |  | Borland runtime / libc | FUN_1000_3746 |
| 1000:2577 | cputs | 22 | conio string output | Borland runtime / libc | show_registration_notice |
| 1000:258d | FUN_1000_258d | 42 |  | Borland runtime / libc | FUN_1000_266d |
| 1000:25b7 | FUN_1000_25b7 | 14 |  | Borland runtime / libc | FUN_1000_25c5, FUN_1000_266d |
| 1000:25c5 | FUN_1000_25c5 | 139 |  | Borland runtime / libc | clrscr, FUN_1000_2444, FUN_1000_25b7, FUN_1000_266d, FUN_1000_31a9, FUN_1000_3795 … |
| 1000:266d | FUN_1000_266d | 193 |  | Borland runtime / libc | FUN_1000_3c67 |
| 1000:274d | FUN_1000_274d | 1 |  | Borland runtime / libc | FUN_1000_274e |
| 1000:274e | FUN_1000_274e | 26 |  | Borland runtime / libc | FUN_1000_2789 |
| 1000:2789 | FUN_1000_2789 | 97 |  | Borland runtime / libc | mset_gmenu, FUN_2000_3e73, FUN_2000_7dec, FUN_2000_826d, defend, FUN_2000_907b … |
| 1000:2b80 | FUN_1000_2b80 | 26 |  | Borland runtime / libc | load_level_screen |
| 1000:2ba6 | FUN_1000_2ba6 | 99 |  | Borland runtime / libc | FUN_1000_2cda |
| 1000:2c09 | FUN_1000_2c09 | 113 |  | Borland runtime / libc | FUN_1000_2cda |
| 1000:2c7a | FUN_1000_2c7a | 41 |  | Borland runtime / libc | FUN_1000_2ba6, farmalloc |
| 1000:2ca3 | FUN_1000_2ca3 | 55 |  | Borland runtime / libc | FUN_1000_2c09 |
| 1000:2cda | FUN_1000_2cda | 41 |  | Borland runtime / libc | FUN_1000_2e61, FUN_1000_2edd, FUN_1000_2f41 |
| 1000:2d03 | FUN_1000_2d03 | 100 |  | Borland runtime / libc | farmalloc |
| 1000:2d67 | FUN_1000_2d67 | 90 |  | Borland runtime / libc | farmalloc |
| 1000:2dc1 | FUN_1000_2dc1 | 35 |  | Borland runtime / libc | farmalloc |
| 1000:2de4 | farmalloc | 125 | far heap allocation | Borland runtime / libc | FUN_1000_2e61, FUN_1000_2f41, allocate_buffers, main, load_font |
| 1000:2e61 | FUN_1000_2e61 | 124 |  | Borland runtime / libc | FUN_1000_2f41 |
| 1000:2edd | FUN_1000_2edd | 100 |  | Borland runtime / libc | FUN_1000_2f41 |
| 1000:2f41 | FUN_1000_2f41 | 122 |  | Borland runtime / libc |  |
| 1000:2fbb | FUN_1000_2fbb | 118 |  | Borland runtime / libc | FUN_1000_3031, FUN_1000_3070 |
| 1000:3031 | FUN_1000_3031 | 63 |  | Borland runtime / libc | FUN_1000_2ba6, FUN_1000_2edd |
| 1000:3070 | FUN_1000_3070 | 139 |  | Borland runtime / libc | FUN_1000_2d03, FUN_1000_2d67 |
| 1000:30fb | FUN_1000_30fb | 80 |  | Borland runtime / libc | main |
| 1000:314b | FUN_1000_314b | 25 |  | Borland runtime / libc | write_scroll_or_wand, FUN_4000_417b |
| 1000:31a9 | FUN_1000_31a9 | 73 |  | Borland runtime / libc | FUN_2000_34ea, FUN_2000_3533, FUN_2000_35bf, load_level_screen |
| 1000:31f2 | FUN_1000_31f2 | 84 |  | Borland runtime / libc | FUN_1000_393c |
| 1000:3246 | FUN_1000_3246 | 84 |  | Borland runtime / libc | FUN_1000_393c |
| 1000:329a | int86 | 40 | Borland int86(intno, inregs, outregs): INT 10h for the VGA DAC, INT 33h for the mouse | Borland runtime / libc | FUN_2000_000d, FUN_2000_0520, FUN_2000_1545, FUN_2000_34a9, set_16_colours, FUN_4000_0f94 … |
| 1000:32c2 | FUN_1000_32c2 | 156 |  | Borland runtime / libc | int86, apply_palette |
| 1000:335e | FUN_1000_335e | 39 |  | Borland runtime / libc | FUN_1000_46f6 |
| 1000:3385 | FUN_1000_3385 | 18 |  | Borland runtime / libc | FUN_2000_2a2e, mset_gmenu, get_choice, select_player, strike, movecontrol … |
| 1000:3397 | FUN_1000_3397 | 151 |  | Borland runtime / libc | FUN_1000_2b80 |
| 1000:342e | FUN_1000_342e | 157 |  | Borland runtime / libc | FUN_1000_393c |
| 1000:34cb | FUN_1000_34cb | 29 |  | Borland runtime / libc | FUN_1000_3397, FUN_1000_4c89, FUN_2000_01de, FUN_2000_0351, fclose |
| 1000:34e8 | FUN_1000_34e8 | 58 |  | Borland runtime / libc | FUN_1000_34cb |
| 1000:3522 | FUN_1000_3522 | 57 |  | Borland runtime / libc | FUN_1000_34cb |
| 1000:355b | FUN_1000_355b | 28 |  | Borland runtime / libc | FUN_1000_34e8, farmalloc_small |
| 1000:3577 | FUN_1000_3577 | 35 |  | Borland runtime / libc | FUN_1000_3522 |
| 1000:359a | farmalloc_small | 96 | allocation helper used for menu strings | Borland runtime / libc | FUN_1000_11fd, FUN_1000_12a6, FUN_1000_4c89, FUN_2000_01de, allocate_buffers, load_md_bin … |
| 1000:35fa | FUN_1000_35fa | 64 |  | Borland runtime / libc | farmalloc_small |
| 1000:363a | FUN_1000_363a | 41 |  | Borland runtime / libc | farmalloc_small |
| 1000:3663 | FUN_1000_3663 | 25 |  | Borland runtime / libc | farmalloc_small |
| 1000:3746 | FUN_1000_3746 | 19 |  | Borland runtime / libc |  |
| 1000:3759 | thunk_FUN_1000_05db | 4 |  | Borland runtime / libc | FUN_1000_1e45 |
| 1000:375d | FUN_1000_375d | 56 |  | Borland runtime / libc | FUN_1000_37c3 |
| 1000:3795 | FUN_1000_3795 | 46 |  | Borland runtime / libc | FUN_1000_37c3 |
| 1000:37c3 | FUN_1000_37c3 | 198 |  | Borland runtime / libc | FUN_1000_3889 |
| 1000:3889 | FUN_1000_3889 | 60 |  | Borland runtime / libc | FUN_1000_31f2, FUN_1000_3246, FUN_1000_342e |
| 1000:38c5 | FUN_1000_38c5 | 85 |  | Borland runtime / libc | FUN_1000_31f2, FUN_1000_3246, FUN_1000_342e |
| 1000:391a | FUN_1000_391a | 34 |  | Borland runtime / libc | FUN_1000_393c |
| 1000:393c | FUN_1000_393c | 358 |  | Borland runtime / libc | clrscr, FUN_1000_2444 |
| 1000:3bbb | FUN_1000_3bbb | 28 |  | Borland runtime / libc | FUN_1000_2fbb |
| 1000:3c34 | FUN_1000_3c34 | 44 |  | Borland runtime / libc | FUN_2000_7dec, FUN_2000_826d, FUN_2000_907b, FUN_3000_b0ea |
| 1000:3c60 | FUN_1000_3c60 | 7 |  | Borland runtime / libc | FUN_2000_7dec, FUN_2000_826d, FUN_2000_907b, FUN_3000_b0ea |
| 1000:3c67 | FUN_1000_3c67 | 31 |  | Borland runtime / libc | quit_game |
| 1000:3c86 | FUN_1000_3c86 | 10 |  | Borland runtime / libc | FUN_1000_2444, FUN_1000_37c3 |
| 1000:3cb2 | atol | 112 | string -> long | Borland runtime / libc | FUN_1000_3d22, FUN_1000_53da, g_store, bank, main |
| 1000:3d22 | FUN_1000_3d22 | 13 |  | Borland runtime / libc |  |
| 1000:3d2f | FUN_1000_3d2f | 27 |  | Borland runtime / libc | FUN_1000_46f6 |
| 1000:3d4a | FUN_1000_3d4a | 40 |  | Borland runtime / libc | fclose |
| 1000:3d72 | FUN_1000_3d72 | 30 |  | Borland runtime / libc | FUN_1000_3d4a, FUN_1000_46f6 |
| 1000:3d90 | FUN_1000_3d90 | 119 |  | Borland runtime / libc | fgetc |
| 1000:3e07 | fclose | 129 | libc | Borland runtime / libc | FUN_1000_405f, give_hint, load_overlay_pic, load_section_pictures, select_player, load_md_bin … |
| 1000:3e88 | FUN_1000_3e88 | 127 |  | Borland runtime / libc | FUN_1000_3f6b, FUN_1000_42da, FUN_1000_4455, FUN_1000_48cb, FUN_1000_4a13, fclose |
| 1000:3f09 | fgets | 98 | libc | Borland runtime / libc | load_md_bin |
| 1000:3f6b | FUN_1000_3f6b | 58 |  | Borland runtime / libc | FUN_1000_3e88 |
| 1000:3fa5 | FUN_1000_3fa5 | 186 |  | Borland runtime / libc | FUN_1000_405f |
| 1000:405f | FUN_1000_405f | 156 |  | Borland runtime / libc | fopen |
| 1000:40fb | FUN_1000_40fb | 43 |  | Borland runtime / libc | fopen |
| 1000:4126 | fopen | 31 | libc | Borland runtime / libc | give_hint, load_overlay_pic, load_section_pictures, select_player, load_md_bin, show_registration_notice … |
| 1000:4145 | FUN_1000_4145 | 22 |  | Borland runtime / libc | FUN_1000_0d04, FUN_1000_10b1 |
| 1000:415b | FUN_1000_415b | 215 |  | Borland runtime / libc | fread |
| 1000:4232 | fread | 75 | libc | Borland runtime / libc | load_md_bin, load_unfdung_bin, load_player |
| 1000:427d | FUN_1000_427d | 93 |  | Borland runtime / libc | FUN_1000_42da, FUN_1000_4342 |
| 1000:42da | FUN_1000_42da | 104 |  | Borland runtime / libc | FUN_1000_4c89 |
| 1000:4342 | FUN_1000_4342 | 199 |  | Borland runtime / libc |  |
| 1000:4409 | fwrite | 76 | libc | Borland runtime / libc | save_player |
| 1000:4455 | FUN_1000_4455 | 41 |  | Borland runtime / libc | FUN_1000_447e, fgetc |
| 1000:447e | FUN_1000_447e | 89 |  | Borland runtime / libc | fgetc |
| 1000:44d7 | FUN_1000_44d7 | 18 |  | Borland runtime / libc | fgets, FUN_1000_415b |
| 1000:44ec | fgetc | 173 | libc | Borland runtime / libc | FUN_1000_44d7, load_overlay_pic, load_section_pictures, select_player, show_registration_notice, load_monster_map … |
| 1000:45a5 | FUN_1000_45a5 | 95 |  | Borland runtime / libc | FUN_1000_1a1f, FUN_1000_53da |
| 1000:4604 | itoa | 40 | libc | Borland runtime / libc | load_section_pictures, flea_inn, select_player, load_player, save_player, FUN_2000_7bcd … |
| 1000:462c | FUN_1000_462c | 26 |  | Borland runtime / libc |  |
| 1000:4646 | ltoa | 37 | libc (long -> string) | Borland runtime / libc | g_store, flea_inn, bank, num_to_string, FUN_4000_5aca, drop_money |
| 1000:466b | FUN_1000_466b | 31 |  | Borland runtime / libc | FUN_1000_2337, FUN_1000_4a13, FUN_1000_4f8a |
| 1000:468a | FUN_1000_468a | 38 |  | Borland runtime / libc | FUN_1000_46b0 |
| 1000:46b0 | FUN_1000_46b0 | 27 |  | Borland runtime / libc | FUN_1000_53da |
| 1000:46cb | FUN_1000_46cb | 25 |  | Borland runtime / libc | FUN_1000_46f6 |
| 1000:46e4 | FUN_1000_46e4 | 18 |  | Borland runtime / libc | FUN_1000_46f6 |
| 1000:46f6 | FUN_1000_46f6 | 344 |  | Borland runtime / libc | FUN_1000_405f |
| 1000:484e | FUN_1000_484e | 77 |  | Borland runtime / libc | FUN_1000_46f6 |
| 1000:489b | puts | 23 | libc text output (error messages) | Borland runtime / libc | FUN_2000_0377, load_section_pictures, load_player |
| 1000:48b2 | FUN_1000_48b2 | 25 |  | Borland runtime / libc | FUN_1000_4a13 |
| 1000:48cb | FUN_1000_48cb | 305 |  | Borland runtime / libc | FUN_1000_48b2, FUN_1000_4a01, FUN_1000_4a13, save_monster_map, save_maps, save_player |
| 1000:4a01 | FUN_1000_4a01 | 18 |  | Borland runtime / libc |  |
| 1000:4a13 | FUN_1000_4a13 | 419 |  | Borland runtime / libc | fwrite |
| 1000:4bbb | FUN_1000_4bbb | 206 |  | Borland runtime / libc | FUN_1000_447e, fgetc |
| 1000:4c89 | FUN_1000_4c89 | 213 |  | Borland runtime / libc | FUN_1000_405f |
| 1000:4d61 | FUN_1000_4d61 | 63 |  | Borland runtime / libc | FUN_1000_4df7 |
| 1000:4da0 | FUN_1000_4da0 | 65 |  | Borland runtime / libc |  |
| 1000:4df7 | FUN_1000_4df7 | 280 |  | Borland runtime / libc | FUN_1000_1a1f |
| 1000:4f8a | FUN_1000_4f8a | 40 |  | Borland runtime / libc |  |
| 1000:4fb2 | FUN_1000_4fb2 | 29 |  | Borland runtime / libc | FUN_2000_7bcd, engagement_timing, FUN_2000_fb25, FUN_3000_caac |
| 1000:4fcf | FUN_1000_4fcf | 28 |  | Borland runtime / libc |  |
| 1000:4feb | strcat | 57 | libc | Borland runtime / libc | FUN_1000_17eb, store_refund, g_store, flea_inn, bank, select_player … |
| 1000:5024 | FUN_1000_5024 | 54 |  | Borland runtime / libc | movecontrol, read_help_screen |
| 1000:505a | FUN_1000_505a | 47 |  | Borland runtime / libc | pfont, psfont |
| 1000:5089 | strcpy | 34 | libc | Borland runtime / libc | FUN_1000_1b91, FUN_1000_1bc4, FUN_1000_4d61, FUN_1000_53da, FUN_2000_2a83, FUN_2000_2ecc … |
| 1000:50ab | strlen | 26 | libc | Borland runtime / libc | FUN_1000_11fd, FUN_1000_12a6, FUN_1000_195e, FUN_1000_2337, FUN_1000_4d61, FUN_1000_4df7 … |
| 1000:50c5 | FUN_1000_50c5 | 44 |  | Borland runtime / libc | FUN_1000_4d61, FUN_1000_4df7, FUN_1000_53da |
| 1000:50f1 | FUN_1000_50f1 | 281 |  | Borland runtime / libc | FUN_1000_1d12 |
| 1000:520a | FUN_1000_520a | 464 |  | Borland runtime / libc | FUN_1000_1cda |
| 1000:53da | FUN_1000_53da | 385 |  | Borland runtime / libc | FUN_1000_50f1, FUN_1000_520a |
| 1000:555b | FUN_1000_555b | 223 |  | Borland runtime / libc | FUN_1000_50f1, FUN_1000_520a |
| 1000:563a | FUN_1000_563a | 270 |  | Borland runtime / libc | FUN_1000_3e88, FUN_1000_4a13 |
| 1000:5748 | FUN_1000_5748 | 58 |  | Borland runtime / libc | FUN_1000_48cb, FUN_1000_4a13, FUN_1000_563a |
| 2000:000d | FUN_2000_000d | 98 |  | WORLD (UNF.CPP) | FUN_2000_0388, FUN_2000_03ae |
| 2000:0073 | FUN_2000_0073 | 39 |  | WORLD (UNF.CPP) | FUN_4000_26d3 |
| 2000:009a | FUN_2000_009a | 41 |  | WORLD (UNF.CPP) | FUN_2000_00c3, FUN_2000_01b8 |
| 2000:00c3 | FUN_2000_00c3 | 136 |  | WORLD (UNF.CPP) | FUN_2000_014b |
| 2000:014b | FUN_2000_014b | 33 |  | WORLD (UNF.CPP) |  |
| 2000:016c | FUN_2000_016c | 41 |  | WORLD (UNF.CPP) | FUN_2000_01b8 |
| 2000:0195 | FUN_2000_0195 | 35 |  | WORLD (UNF.CPP) | FUN_2000_01b8 |
| 2000:01b8 | FUN_2000_01b8 | 38 |  | WORLD (UNF.CPP) | FUN_2000_01de |
| 2000:01de | FUN_2000_01de | 146 |  | WORLD (UNF.CPP) | FUN_2000_0388, FUN_2000_03ae |
| 2000:0272 | FUN_2000_0272 | 104 |  | WORLD (UNF.CPP) | apply_palette, FUN_4000_3b44, FUN_4000_5b3f, FUN_4000_5b91, FUN_4000_5c25 |
| 2000:02da | FUN_2000_02da | 119 |  | WORLD (UNF.CPP) |  |
| 2000:0351 | FUN_2000_0351 | 38 |  | WORLD (UNF.CPP) | FUN_2000_1af9 |
| 2000:0377 | FUN_2000_0377 | 17 |  | WORLD (UNF.CPP) | FUN_2000_0388, FUN_2000_03ae |
| 2000:0388 | FUN_2000_0388 | 38 |  | WORLD (UNF.CPP) | FUN_2000_1598 |
| 2000:03ae | FUN_2000_03ae | 38 |  | WORLD (UNF.CPP) | FUN_2000_1598 |
| 2000:03d4 | FUN_2000_03d4 | 71 |  | WORLD (UNF.CPP) | select_player, cast_a_spell, roll_char, FUN_3000_7dfc, monster_manual |
| 2000:041b | FUN_2000_041b | 156 |  | WORLD (UNF.CPP) |  |
| 2000:04b7 | FUN_2000_04b7 | 28 |  | WORLD (UNF.CPP) | allocate_buffers, roll_char |
| 2000:04d3 | FUN_2000_04d3 | 77 |  | WORLD (UNF.CPP) |  |
| 2000:0520 | FUN_2000_0520 | 51 |  | WORLD (UNF.CPP) |  |
| 2000:0553 | FUN_2000_0553 | 135 |  | WORLD (UNF.CPP) | FUN_2000_05da |
| 2000:05da | FUN_2000_05da | 497 |  | WORLD (UNF.CPP) | FUN_2000_082b, FUN_2000_08eb |
| 2000:07cb | FUN_2000_07cb | 96 |  | WORLD (UNF.CPP) |  |
| 2000:082b | FUN_2000_082b | 42 |  | WORLD (UNF.CPP) |  |
| 2000:0855 | FUN_2000_0855 | 106 |  | WORLD (UNF.CPP) | FUN_2000_0855 |
| 2000:08bf | FUN_2000_08bf | 44 |  | WORLD (UNF.CPP) |  |
| 2000:08eb | FUN_2000_08eb | 56 |  | WORLD (UNF.CPP) |  |
| 2000:0923 | FUN_2000_0923 | 227 |  | WORLD (UNF.CPP) |  |
| 2000:0a06 | FUN_2000_0a06 | 445 |  | WORLD (UNF.CPP) | FUN_2000_0fc5 |
| 2000:0bc3 | FUN_2000_0bc3 | 448 |  | WORLD (UNF.CPP) | draw_3d_view |
| 2000:0d83 | FUN_2000_0d83 | 303 |  | WORLD (UNF.CPP) | FUN_2000_0ec2, FUN_4000_4f8f |
| 2000:0ec2 | FUN_2000_0ec2 | 259 |  | WORLD (UNF.CPP) | FUN_2000_0fc5 |
| 2000:0fc5 | FUN_2000_0fc5 | 549 |  | WORLD (UNF.CPP) |  |
| 2000:11ea | FUN_2000_11ea | 424 |  | WORLD (UNF.CPP) |  |
| 2000:1392 | FUN_2000_1392 | 435 |  | WORLD (UNF.CPP) | FUN_4000_2af1, FUN_4000_2d90 |
| 2000:1545 | FUN_2000_1545 | 44 |  | WORLD (UNF.CPP) | FUN_2000_1598 |
| 2000:1571 | FUN_2000_1571 | 39 |  | WORLD (UNF.CPP) |  |
| 2000:1598 | FUN_2000_1598 | 1353 |  | WORLD (UNF.CPP) | main |
| 2000:1af9 | FUN_2000_1af9 | 9 |  | WORLD (UNF.CPP) | gmode |
| 2000:1b02 | shade_palette | 95 | 16 darker copies of colours 0..15 for distance shading (16-colour modes) | WORLD (UNF.CPP) | FUN_2000_1b61 |
| 2000:1b61 | FUN_2000_1b61 | 250 |  | WORLD (UNF.CPP) | FUN_2000_1598 |
| 2000:1c5b | FUN_2000_1c5b | 89 |  | WORLD (UNF.CPP) | main |
| 2000:1ccc | section_number3 | 67 | floor -> 0-based section index | WORLD (UNF.CPP) | section_number_p, section_number, section_number2 |
| 2000:1d12 | section_number_p | 15 | wrapper | WORLD (UNF.CPP) | movecontrol |
| 2000:1d23 | section_number | 16 | current floor's section | WORLD (UNF.CPP) | FUN_2000_31bc, stock_level, load_level_map, boss_office_message, kill_monster, set_palette |
| 2000:1d35 | section_number2 | 24 | section within the module (0..3) | WORLD (UNF.CPP) | stock_level, boss_office_message, monster_manual, gradient_palette, set_palette |
| 2000:1d4f | FUN_2000_1d4f | 908 |  | WORLD (UNF.CPP) |  |
| 2000:20db | FUN_2000_20db | 148 |  | WORLD (UNF.CPP) | FUN_2000_2820, FUN_2000_28be, select_player, view_battle_spells, draw_ladder_prompt, FUN_2000_ac9e … |
| 2000:216f | FUN_2000_216f | 249 |  | WORLD (UNF.CPP) | FUN_2000_3e73, draw_ladder_prompt, monster_manual |
| 2000:2268 | FUN_2000_2268 | 1464 |  | WORLD (UNF.CPP) | FUN_2000_2820, FUN_2000_28be, strike, view_battle_spells, FUN_2000_ac9e, cast_a_spell |
| 2000:2820 | FUN_2000_2820 | 158 |  | WORLD (UNF.CPP) | mset_gmenu, get_choice, FUN_2000_2f5d, FUN_2000_4054, show_money, g_store … |
| 2000:28be | FUN_2000_28be | 157 |  | WORLD (UNF.CPP) | mset_gmenu, get_choice, FUN_2000_4054, show_money, temple, defend … |
| 2000:295b | FUN_2000_295b | 211 |  | WORLD (UNF.CPP) | strike, defend, print_battle_hp_info |
| 2000:2a2e | FUN_2000_2a2e | 81 |  | WORLD (UNF.CPP) | FUN_2000_4054, FUN_2000_412a, FUN_3000_7545, view_stats, read_help_screen |
| 2000:2a83 | FUN_2000_2a83 | 133 |  | WORLD (UNF.CPP) | lose_item, movecontrol, kill_monster, enchant_weapon_perm, enchant_armor_perm |
| 2000:2b08 | mset_gmenu | 645 | fill the 8 menu strings | WORLD (UNF.CPP) | FUN_2000_2ecc, flea_inn, lose_item, movecontrol, cast_a_spell, drop_spellbook … |
| 2000:2d93 | get_choice | 309 | wait for a menu key in a range | WORLD (UNF.CPP) | g_store, temple, flea_inn, bank, lose_item, use_magic_item … |
| 2000:2ecc | FUN_2000_2ecc | 143 |  | WORLD (UNF.CPP) | g_store |
| 2000:2f5d | FUN_2000_2f5d | 281 |  | WORLD (UNF.CPP) | FUN_2000_3076, g_store, defend, lose_item, movecontrol, pass_wall |
| 2000:3076 | FUN_2000_3076 | 40 |  | WORLD (UNF.CPP) | print_menu_only, give_hint, show_money, flea_inn, FUN_2000_7bcd, defend … |
| 2000:309e | print_menu_only | 152 | show an 8-line message box | WORLD (UNF.CPP) | store_refund, FUN_2000_44c6, g_store, temple, use_magic_item, dig_hole … |
| 2000:313a | give_hint | 130 | print hint n from UH.BIN | WORLD (UNF.CPP) | FUN_2000_31bc, FUN_2000_44f2, g_store, temple, flea_inn, bank … |
| 2000:31bc | FUN_2000_31bc | 749 |  | WORLD (UNF.CPP) | movecontrol |
| 2000:34a9 | FUN_2000_34a9 | 65 |  | WORLD (UNF.CPP) | FUN_2000_34ea, FUN_2000_3533, FUN_2000_35bf |
| 2000:34ea | FUN_2000_34ea | 73 |  | WORLD (UNF.CPP) | allocate_buffers |
| 2000:3533 | FUN_2000_3533 | 140 |  | WORLD (UNF.CPP) | allocate_buffers, main, load_level_screen |
| 2000:35bf | FUN_2000_35bf | 130 |  | WORLD (UNF.CPP) |  |
| 2000:3641 | FUN_2000_3641 | 17 |  | WORLD (UNF.CPP) | allocate_buffers, main |
| 2000:3654 | load_overlay_pic | 216 | loads OVERLAY.PIC (the water overlay) into the picture table | WORLD (UNF.CPP) | allocate_buffers, load_picture_seq, load_building_picture |
| 2000:372c | load_section_pictures | 1179 | loads UFMON<n>.PIC / UFWALL<n>.PIC for a section (name tables DS:02c5 / DS:02ef); sets the water flag for sections 4, 8, 20 | WORLD (UNF.CPP) | load_level_map |
| 2000:3bc7 | allocate_buffers | 468 | farmalloc all the big arrays (monster map, menus) | WORLD (UNF.CPP) | main |
| 2000:3d9b | reset_view_caches | 146 | throws away everything cached about the view, so the next frame is drawn from nothing | WORLD (UNF.CPP) | dig_hole, change_module, movecontrol, roll_char, boss_office_message, FUN_3000_71e6 … |
| 2000:3e2d | FUN_2000_3e2d | 70 |  | WORLD (UNF.CPP) |  |
| 2000:3e73 | FUN_2000_3e73 | 481 |  | WORLD (UNF.CPP) | FUN_2000_4054, FUN_2000_412a, module_transition_screen |
| 2000:4054 | FUN_2000_4054 | 208 |  | WORLD (UNF.CPP) | print_menu_only, show_money, FUN_2000_44f2, g_store, temple, flea_inn … |
| 2000:412a | FUN_2000_412a | 40 |  | WORLD (UNF.CPP) | defend, FUN_3000_9026 |
| 2000:4156 | Random | 84 | srand(clock()) then random(n) | WORLD (UNF.CPP) | get_mtype, stock_level, defend, FUN_2000_9232, use_magic_item, attack_timing … |
| 2000:41ae | compute_weight | 100 | loaded weight = body + armor + weapons (0 with Feather) | WORLD (UNF.CPP) | end_prep_spells, lose_item, movecontrol, drop_weapon, drop_armor, spell_effect |
| 2000:4212 | end_prep_spells | 123 | clears preparation-spell effects (called by the inn) | WORLD (UNF.CPP) | flea_inn |
| 2000:428d | store_refund | 254 | children-helped refund on stock/crystal purchases | WORLD (UNF.CPP) | g_store |
| 2000:438f | show_money | 311 | prints rubles after a purchase | WORLD (UNF.CPP) | g_store, bank, movecontrol |
| 2000:44c6 | FUN_2000_44c6 | 44 |  | WORLD (UNF.CPP) | g_store |
| 2000:44f2 | FUN_2000_44f2 | 20 |  | WORLD (UNF.CPP) | g_store |
| 2000:4506 | FUN_2000_4506 | 165 |  | WORLD (UNF.CPP) | g_store, temple, flea_inn, bank |
| 2000:45ab | g_store | 1934 | general store | WORLD (UNF.CPP) | movecontrol |
| 2000:4d39 | temple | 666 | temple menu | WORLD (UNF.CPP) | movecontrol |
| 2000:4fe7 | flea_inn | 1700 | inn: room price, aging, SP refill, level up | WORLD (UNF.CPP) | movecontrol |
| 2000:568b | bank | 813 | bank menu | WORLD (UNF.CPP) | movecontrol |
| 2000:59c0 | FUN_2000_59c0 | 589 |  | WORLD (UNF.CPP) | main, FUN_2000_c28b, movecontrol |
| 2000:5c0d | select_player | 875 | character-select screen | WORLD (UNF.CPP) | main |
| 2000:5f78 | decode_quit_message | 116 | un-Caesars (+2, ` = space) the hidden 'PLEASE DO NOT DISTRIBUTE THIS GAME' | WORLD (UNF.CPP) | quit_game |
| 2000:5fec | load_md_bin | 252 | reads section records from MD.BIN: 5x29-byte monsters, 4 and 20 40-char text lines each | WORLD (UNF.CPP) | load_level_map |
| 2000:60e8 | show_registration_notice | 295 | prints the file 'v' in yellow text mode, waits for a key, 5-way checksum vs constants; mismatch sets the tamper flag -> main exits | WORLD (UNF.CPP) | main |
| 2000:620f | main | 863 | game main loop | WORLD (UNF.CPP) | entry |
| 2000:6573 | which_monster | 59 | monster index at (x, y) | WORLD (UNF.CPP) | draw_3d_view, draw_map_square |
| 2000:65b0 | monster_at | 42 | the slot of the monster standing on a square, or -1 when it is empty | WORLD (UNF.CPP) | check_engagement, pass_moment, movecontrol, title_screen, relocate, pass_wall |
| 2000:65dc | set_monster_map | 28 | write the 80x110 occupancy map | WORLD (UNF.CPP) | stock_level, load_monster_map, pass_moment, FUN_2000_bcb6, FUN_2000_bce5, movecontrol … |
| 2000:65f8 | get_mtype | 291 | random monster type for stocking | WORLD (UNF.CPP) | stock_level |
| 2000:671e | stock_level | 2320 | populate a floor with 145 monsters (boss placement) | WORLD (UNF.CPP) | load_monster_map, load_level_map, roll_char, title_screen |
| 2000:702e | save_monster_map | 198 | writes <letter>MON.MAP ('wb') at quit | WORLD (UNF.CPP) | quit_game |
| 2000:70f4 | load_monster_map | 284 | reads <letter>MON.MAP; if missing, stock_level() populates the floor | WORLD (UNF.CPP) | load_level_map |
| 2000:7210 | FUN_2000_7210 | 99 |  | WORLD (UNF.CPP) | movecontrol, draw_map_square, FUN_3000_8e75 |
| 2000:7277 | FUN_2000_7277 | 99 |  | WORLD (UNF.CPP) | drawsquare |
| 2000:72de | FUN_2000_72de | 53 |  | WORLD (UNF.CPP) | use_magic_item, movecontrol, draw_map_square |
| 2000:7313 | save_maps | 411 | writes <letter><module><n>.DUN ('wb'); called on floor change, quit and death | WORLD (UNF.CPP) | load_level_map, quit_game, change_module |
| 2000:74ae | load_maps | 473 | reads <letter><module><n>.DUN ('rb') | WORLD (UNF.CPP) | load_level_map |
| 2000:7687 | load_level_map | 295 | load/stock the monster array for a floor | WORLD (UNF.CPP) | main, use_magic_item, chute, dig_hole, movecontrol, title_screen … |
| 2000:77ae | FUN_2000_77ae | 78 |  | WORLD (UNF.CPP) |  |
| 2000:7800 | FUN_2000_7800 | 47 |  | WORLD (UNF.CPP) |  |
| 2000:7832 | FUN_2000_7832 | 69 |  | WORLD (UNF.CPP) |  |
| 2000:787d | load_unfdung_bin | 55 | fread(25 x 512 bytes) of the wall patterns into DS:8680 | WORLD (UNF.CPP) | main |
| 2000:78b4 | load_player | 249 | itoa(slot) file name, fread 0xa87 bytes into pc (DS:b880); 'Corrupted Character! Sorry!' on bad checksum | WORLD (UNF.CPP) | main |
| 2000:79ad | save_player | 203 | itoa(slot) file name, fwrite 0xa87 bytes; called by defend, pass_moment, chute, change_module, quit, roll_char | WORLD (UNF.CPP) | defend, quit_game, pass_moment, chute, change_module, roll_char |
| 2000:7a78 | read_spell_help | 208 | reads entry n from USPELLS.HLP | WORLD (UNF.CPP) | show_spell_help |
| 2000:7b48 | exp_needed | 126 | 250*1.4^(l-1)-80 / 250*2^(l-1) | WORLD (UNF.CPP) | FUN_2000_7bcd, defend |
| 2000:7bcd | FUN_2000_7bcd | 164 |  | WORLD (UNF.CPP) | movecontrol |
| 2000:7c71 | check_gain_level | 174 | exp > exp_needed(lev)? | WORLD (UNF.CPP) | flea_inn, random_events_tick, kill_monster |
| 2000:7d23 | gain_level | 196 | apply level-ups | WORLD (UNF.CPP) | flea_inn |
| 2000:7dec | FUN_2000_7dec | 74 |  | WORLD (UNF.CPP) | strike |
| 2000:7e36 | strike | 845 | player attack roll | WORLD (UNF.CPP) | movecontrol |
| 2000:8189 | gain_or_drain | 216 | moves one of the six stats by a point, the stat picked by the size of -6..-1 / 1..6 | WORLD (UNF.CPP) | defend |
| 2000:826d | FUN_2000_826d | 74 |  | WORLD (UNF.CPP) | defend |
| 2000:82b7 | defend | 3272 | monster attack roll + drains/poison/disease | WORLD (UNF.CPP) | call_check_eng |
| 2000:8f85 | FUN_2000_8f85 | 20 |  | WORLD (UNF.CPP) | FUN_2000_9232 |
| 2000:8f99 | null_check | 226 | null-pointer guard on a far pointer | WORLD (UNF.CPP) | load_level_screen |
| 2000:907b | FUN_2000_907b | 67 |  | WORLD (UNF.CPP) | FUN_2000_9232 |
| 2000:90be | load_level_screen | 372 | 'LOADING... PLEASE WAIT' wrapper around the level loader | WORLD (UNF.CPP) | FUN_2000_9232 |
| 2000:9232 | FUN_2000_9232 | 117 |  | WORLD (UNF.CPP) | movecontrol |
| 2000:92b1 | view_prep_spells | 358 | lists active preparation spells | WORLD (UNF.CPP) | movecontrol |
| 2000:9417 | view_battle_spells | 1184 | lists active battle spells | WORLD (UNF.CPP) | movecontrol, cast_a_spell, FUN_3000_caac |
| 2000:98b7 | lose_item | 860 | an item is destroyed/lost message | WORLD (UNF.CPP) | movecontrol |
| 2000:9c13 | quit_game | 167 | Q: save monster map, maps, player; prints the decoded 'PLEASE DO NOT DISTRIBUTE' line; exit | WORLD (UNF.CPP) | movecontrol |
| 2000:9cba | trapdoor | 87 | trap door destination for a square | WORLD (UNF.CPP) | movecontrol, draw_map_square, drawsquare |
| 2000:9d17 | FUN_2000_9d17 | 843 |  | WORLD (UNF.CPP) | movecontrol |
| 2000:a068 | FUN_2000_a068 | 92 |  | WORLD (UNF.CPP) | movecontrol |
| 2000:a0c8 | check_engagement | 233 | monster in front of the player? | WORLD (UNF.CPP) | engagement_timing, attack_timing |
| 2000:a1b7 | tick_spell_timers | 354 | decrement battle-spell timers | WORLD (UNF.CPP) | pass_moment |
| 2000:a319 | call_check_eng | 547 | engagement in all four directions | WORLD (UNF.CPP) | FUN_2000_bce5, movecontrol |
| 2000:a53c | pass_moment | 1258 | one game moment: disease/poison, monster movement | WORLD (UNF.CPP) | dig_hole, FUN_2000_bce5, movecontrol |
| 2000:aa26 | FUN_2000_aa26 | 111 |  | WORLD (UNF.CPP) | flea_inn, dig_hole |
| 2000:aa95 | draw_ladder_prompt | 521 | HIT U/D box with the ladder picture | WORLD (UNF.CPP) | FUN_2000_ac9e |
| 2000:ac9e | FUN_2000_ac9e | 1305 |  | WORLD (UNF.CPP) | movecontrol |
| 2000:b1b7 | move_seconds | 39 | seconds one step costs: a second, plus one per 100 of weight over 10x agility | WORLD (UNF.CPP) | FUN_2000_bce5 |
| 2000:b1e0 | FUN_2000_b1e0 | 34 |  | WORLD (UNF.CPP) | movecontrol |
| 2000:b202 | use_magic_item | 816 | U key: rings/stones/cups/balls | WORLD (UNF.CPP) | movecontrol |
| 2000:b532 | chute | 184 | fall-through message + landing, saves the player | WORLD (UNF.CPP) | movecontrol |
| 2000:b5ea | detect_chute | 157 | chute destination | WORLD (UNF.CPP) | movecontrol, drawsquare |
| 2000:b68d | print_battle_hp_info | 245 | HP/monster line during battle | WORLD (UNF.CPP) | engagement_timing, movecontrol |
| 2000:b782 | engagement_timing | 373 | probable: monster engagement timer | WORLD (UNF.CPP) | movecontrol |
| 2000:b8f7 | attack_timing | 323 | probable: attack interval timer | WORLD (UNF.CPP) | dig_hole, movecontrol |
| 2000:ba3f | dig_hole | 624 | 'DIGGING... DIGGING...': dig through a wall/floor | WORLD (UNF.CPP) | movecontrol |
| 2000:bcb6 | FUN_2000_bcb6 | 47 |  | WORLD (UNF.CPP) | movecontrol |
| 2000:bce5 | FUN_2000_bce5 | 77 |  | WORLD (UNF.CPP) | movecontrol |
| 2000:bd32 | town_features | 112 | store/temple/bank/inn at (x, y) | WORLD (UNF.CPP) | movecontrol, drawsquare |
| 2000:bda6 | trapdoor_dest | 145 | landing square of a trap door | WORLD (UNF.CPP) | movecontrol |
| 2000:be3d | explain_trapdoor | 334 | the trap door explanation box | WORLD (UNF.CPP) | movecontrol |
| 2000:bf91 | FUN_2000_bf91 | 216 |  | WORLD (UNF.CPP) | movecontrol |
| 2000:c069 | module_installed | 56 | fopen() test on the module's first UFMON picture file | WORLD (UNF.CPP) | change_module |
| 2000:c0a5 | change_module | 343 | the module teleporter: next/previous module menu (normal difficulty may not enter Module V), saves maps, floor = 0, relocate() into the new town, saves the player | WORLD (UNF.CPP) | movecontrol |
| 2000:c200 | FUN_2000_c200 | 43 |  | WORLD (UNF.CPP) | movecontrol |
| 2000:c22d | retdwall2 | 90 | retdwall + module teleporters | WORLD (UNF.CPP) | movecontrol |
| 2000:c28b | FUN_2000_c28b | 125 |  | WORLD (UNF.CPP) | movecontrol |
| 2000:c308 | movecontrol | 7128 | the giant keyboard/movement/turn loop | WORLD (UNF.CPP) | main |
| 2000:df0e | FUN_2000_df0e | 44 |  | WORLD (UNF.CPP) | print_spell_line |
| 2000:df3e | print_spell_line | 215 | one line of the spell menu | WORLD (UNF.CPP) | cast_a_spell |
| 2000:e017 | cast_a_spell | 6918 | spell/scroll/wand/paper menus, SP accounting | WORLD (UNF.CPP) | movecontrol |
| 2000:fb25 | FUN_2000_fb25 | 161 |  | WORLD (UNF.CPP) |  |
| 3000:0009 | FUN_3000_0009 | 21 |  | TOWN / MAGICFNC / CAT | FUN_3000_342d |
| 3000:0022 | FUN_3000_0022 | 21 |  | TOWN / MAGICFNC / CAT | FUN_3000_342d |
| 3000:003b | FUN_3000_003b | 40 |  | TOWN / MAGICFNC / CAT | FUN_3000_00a8, FUN_3000_0837 |
| 3000:0067 | FUN_3000_0067 | 24 |  | TOWN / MAGICFNC / CAT | FUN_3000_00a8, FUN_3000_0837 |
| 3000:0081 | FUN_3000_0081 | 35 |  | TOWN / MAGICFNC / CAT | FUN_3000_00a8 |
| 3000:00a8 | FUN_3000_00a8 | 1895 |  | TOWN / MAGICFNC / CAT | FUN_3000_00a8, draw_3d_view |
| 3000:080f | FUN_3000_080f | 38 |  | TOWN / MAGICFNC / CAT | FUN_3000_0837 |
| 3000:0837 | FUN_3000_0837 | 1854 |  | TOWN / MAGICFNC / CAT | FUN_3000_0837, draw_3d_view |
| 3000:0f75 | draw_3d_view | 5949 | the corridor view (walls, doors, monsters) | TOWN / MAGICFNC / CAT | FUN_2000_ac9e, title_screen |
| 3000:27fc | FUN_3000_27fc | 36 |  | TOWN / MAGICFNC / CAT | draw_map_square |
| 3000:2822 | FUN_3000_2822 | 36 |  | TOWN / MAGICFNC / CAT | draw_map_square |
| 3000:2848 | draw_map_square | 2758 | expanded-map square drawing | TOWN / MAGICFNC / CAT | FUN_3000_00a8, FUN_3000_0837, draw_3d_view |
| 3000:3311 | FUN_3000_3311 | 284 |  | TOWN / MAGICFNC / CAT | draw_3d_view, draw_map_square |
| 3000:342d | FUN_3000_342d | 5617 |  | TOWN / MAGICFNC / CAT | FUN_3000_00a8, FUN_3000_0837, draw_3d_view |
| 3000:4a24 | read_uroll_line | 61 | reads the next line of UROLL.TXT, dropping every '|' | TOWN / MAGICFNC / CAT | give_hint, roll_char, FUN_3000_6a6a, tablet_message |
| 3000:4a67 | show_rolled_character | 528 | draws the rolled character's numbers, or rubs them out again | TOWN / MAGICFNC / CAT | roll_char |
| 3000:4c77 | roll_char | 7641 | character creation (stats, HP/SP, money) | TOWN / MAGICFNC / CAT | main |
| 3000:6a6a | FUN_3000_6a6a | 288 |  | TOWN / MAGICFNC / CAT | FUN_3000_6b8a, random_events_tick |
| 3000:6b8a | FUN_3000_6b8a | 197 |  | TOWN / MAGICFNC / CAT | random_events_tick |
| 3000:6c6b | set_16_colours | 50 | BIOS palette for 16-colour modes | TOWN / MAGICFNC / CAT | set_palette |
| 3000:6c9d | boss_office_message | 488 | 'A MESSAGE FROM THE OFFICE OF' screen with the boss picture | TOWN / MAGICFNC / CAT | random_events_tick |
| 3000:6e85 | random_events_tick | 423 | the per-step tick: the boss office message every 250 steps, then the random hints and events | TOWN / MAGICFNC / CAT | movecontrol |
| 3000:703c | FUN_3000_703c | 22 |  | TOWN / MAGICFNC / CAT | FUN_3000_7052 |
| 3000:7052 | FUN_3000_7052 | 352 |  | TOWN / MAGICFNC / CAT | movecontrol |
| 3000:71be | FUN_3000_71be | 40 |  | TOWN / MAGICFNC / CAT | FUN_3000_7545 |
| 3000:71e6 | FUN_3000_71e6 | 802 |  | TOWN / MAGICFNC / CAT | FUN_3000_7545 |
| 3000:7508 | FUN_3000_7508 | 61 |  | TOWN / MAGICFNC / CAT | FUN_3000_7545, view_stats, read_help_screen, FUN_3000_7dfc |
| 3000:7545 | FUN_3000_7545 | 659 |  | TOWN / MAGICFNC / CAT | movecontrol |
| 3000:77e2 | view_stats | 1163 | the V screen | TOWN / MAGICFNC / CAT | movecontrol |
| 3000:7c6d | read_help_screen | 399 | reads one <n>.uhp help screen, the F1 help the game shows a page at a time | TOWN / MAGICFNC / CAT | FUN_3000_7dfc |
| 3000:7dfc | FUN_3000_7dfc | 866 |  | TOWN / MAGICFNC / CAT | movecontrol |
| 3000:81ba | myrand | 191 | the dungeon hash | TOWN / MAGICFNC / CAT | trapdoor, detect_chute, town_features, check_for_ladder, retdwall |
| 3000:827f | check_for_ladder | 221 | up/down ladder at a square | TOWN / MAGICFNC / CAT | movecontrol, draw_map_square, drawsquare |
| 3000:8360 | retdwall | 204 | wall/door/secret/open for one side | TOWN / MAGICFNC / CAT | check_engagement, call_check_eng, pass_moment, retdwall2, draw_3d_view, FUN_3000_342d … |
| 3000:8432 | draw_side | 643 | draws one side on the map | TOWN / MAGICFNC / CAT | FUN_3000_8736, drawsquare |
| 3000:86b5 | solidcheck | 125 | square is rock? | TOWN / MAGICFNC / CAT | stock_level, use_magic_item, detect_chute, dig_hole, trapdoor_dest, check_for_ladder … |
| 3000:8736 | FUN_3000_8736 | 93 |  | TOWN / MAGICFNC / CAT |  |
| 3000:8793 | FUN_3000_8793 | 75 |  | TOWN / MAGICFNC / CAT | drawsquare |
| 3000:87de | drawsquare | 1440 | draws one explored square with ladder/trap door glyphs | TOWN / MAGICFNC / CAT | movecontrol, draw_map_square, FUN_3000_8e75 |
| 3000:8d7e | FUN_3000_8d7e | 243 |  | TOWN / MAGICFNC / CAT |  |
| 3000:8e75 | FUN_3000_8e75 | 343 |  | TOWN / MAGICFNC / CAT | movecontrol |
| 3000:8fcc | FUN_3000_8fcc | 56 |  | TOWN / MAGICFNC / CAT | boss_office_message, FUN_3000_9026, title_screen |
| 3000:9004 | FUN_3000_9004 | 34 |  | TOWN / MAGICFNC / CAT | select_player, FUN_3000_9026, title_screen |
| 3000:9026 | FUN_3000_9026 | 758 |  | TOWN / MAGICFNC / CAT | FUN_3000_7dfc, tablet_message, monster_manual |
| 3000:931c | tablet_message | 332 | the stone-tablet text box | TOWN / MAGICFNC / CAT | main, roll_char, boss_office_message, FUN_3000_9468, FUN_3000_9488, level_up_screen |
| 3000:9468 | FUN_3000_9468 | 32 |  | TOWN / MAGICFNC / CAT | main |
| 3000:9488 | FUN_3000_9488 | 215 |  | TOWN / MAGICFNC / CAT | load_level_map |
| 3000:955f | level_up_screen | 300 | shows the new level | TOWN / MAGICFNC / CAT | flea_inn |
| 3000:968b | load_picture_seq | 194 | load a picture sequence and draw | TOWN / MAGICFNC / CAT |  |
| 3000:974d | load_building_picture | 620 | load & draw the 4-layer town pictures | TOWN / MAGICFNC / CAT | g_store, temple, flea_inn, bank |
| 3000:99bf | title_screen | 1630 | the opening title picture | TOWN / MAGICFNC / CAT | FUN_3000_a0f1 |
| 3000:a023 | show_spell_help | 152 | spell help viewer (reads USPELLS.HLP) | TOWN / MAGICFNC / CAT | cast_a_spell, drop_spellbook, drop_scroll, drop_wand, drop_paper |
| 3000:a0c1 | FUN_3000_a0c1 | 48 |  | TOWN / MAGICFNC / CAT |  |
| 3000:a0f1 | FUN_3000_a0f1 | 9 |  | TOWN / MAGICFNC / CAT | main |
| 3000:a0fa | exp_value | 196 | XP for a kill: (exp+1)*(L+1+5*1.23^L) | TOWN / MAGICFNC / CAT | engagement_timing, kill_monster |
| 3000:a1c4 | FUN_3000_a1c4 | 56 |  | TOWN / MAGICFNC / CAT | drop_weapon, drop_armor, drop_spellbook, drop_scroll, drop_wand, drop_paper |
| 3000:a1fc | drop_weapon | 475 | weapon drop roll | TOWN / MAGICFNC / CAT | kill_monster |
| 3000:a3d7 | drop_armor | 478 | armor drop roll | TOWN / MAGICFNC / CAT | kill_monster |
| 3000:a5b5 | FUN_3000_a5b5 | 21 |  | TOWN / MAGICFNC / CAT |  |
| 3000:a5cc | spell_name_to_menu | 145 | formats a spell name | TOWN / MAGICFNC / CAT | drop_spellbook, drop_scroll, drop_wand, drop_paper |
| 3000:a65d | drop_spellbook | 523 | spell book learn roll | TOWN / MAGICFNC / CAT | kill_monster |
| 3000:a870 | drop_scroll | 455 | scroll roll | TOWN / MAGICFNC / CAT | kill_monster |
| 3000:aa37 | drop_wand | 568 | wand roll | TOWN / MAGICFNC / CAT | kill_monster |
| 3000:ac6f | drop_paper | 440 | spell paper roll | TOWN / MAGICFNC / CAT | kill_monster |
| 3000:ae27 | find_item | 390 | the 12 'YOU FIND' items | TOWN / MAGICFNC / CAT | kill_monster |
| 3000:afc5 | post_kill_heal | 158 | 1/4 chance cup of health | TOWN / MAGICFNC / CAT | kill_monster |
| 3000:b063 | post_kill_sp | 135 | 1/6 chance ball of thought | TOWN / MAGICFNC / CAT | kill_monster |
| 3000:b0ea | FUN_3000_b0ea | 67 |  | TOWN / MAGICFNC / CAT | kill_monster |
| 3000:b12d | kill_monster | 3129 | XP, drainer bonus, drops, boss rewards | TOWN / MAGICFNC / CAT | movecontrol |
| 3000:bd9a | go_up_level | 747 | HP/SP gain per class | TOWN / MAGICFNC / CAT | gain_level |
| 3000:c093 | go_down_level | 764 | HP/SP loss on level drain | TOWN / MAGICFNC / CAT | defend |
| 3000:c39d | monster_manual | 1807 | section intro + monster descriptions (S key) | TOWN / MAGICFNC / CAT | movecontrol |
| 3000:caac | FUN_3000_caac | 1557 |  | TOWN / MAGICFNC / CAT | movecontrol |
| 3000:d0c1 | msg_no_monster | 45 | 'there is no monster' message | TOWN / MAGICFNC / CAT | explosion, sleep_monster, go_away, autokill, drain_monster, spell_effect |
| 3000:d0ee | msg_already_in_effect | 45 | spell already active message | TOWN / MAGICFNC / CAT | set_temp_armor_plus, set_temp_weapon_plus, set_body_armor, set_prot_ring, set_anti_magic_ring, sleep_monster … |
| 3000:d11b | msg_already_cast_this_spell | 45 | the other 'already cast' refusal | TOWN / MAGICFNC / CAT | strength, speed, strength_and_speed, spell_effect |
| 3000:d148 | enchant_weapon_perm | 197 | set a weapon's plus | TOWN / MAGICFNC / CAT | spell_effect |
| 3000:d211 | enchant_armor_perm | 197 | set an armor's plus | TOWN / MAGICFNC / CAT | spell_effect |
| 3000:d2da | set_temp_armor_plus | 32 | prep enchant armor (refuses if not better) | TOWN / MAGICFNC / CAT | spell_effect |
| 3000:d2fc | set_temp_weapon_plus | 32 | prep enchant weapon | TOWN / MAGICFNC / CAT | spell_effect |
| 3000:d31e | set_body_armor | 32 | body armor spell | TOWN / MAGICFNC / CAT | spell_effect |
| 3000:d340 | set_prot_ring | 32 | ring of protection spell | TOWN / MAGICFNC / CAT | spell_effect |
| 3000:d362 | set_anti_magic_ring | 32 | anti-magic ring spell (never read by the game) | TOWN / MAGICFNC / CAT | spell_effect |
| 3000:d384 | write_scroll_or_wand | 1076 | scroll/wand creation menus | TOWN / MAGICFNC / CAT | spell_effect |
| 3000:d7be | msg_you_feel_good | 45 | what a small cure prints | TOWN / MAGICFNC / CAT | spell_effect |
| 3000:d7eb | msg_you_feel_very_good | 45 | what a big cure or a stat boost prints | TOWN / MAGICFNC / CAT | strength, speed, strength_and_speed, spell_effect |
| 3000:d818 | explosion | 229 | minor/normal/major explosion damage | TOWN / MAGICFNC / CAT | spell_effect |
| 3000:d904 | sleep_monster | 136 | rand(ML) < 3 -> 25 moves | TOWN / MAGICFNC / CAT | spell_effect |
| 3000:d990 | strength | 38 | +7 STR for 60 moves | TOWN / MAGICFNC / CAT | spell_effect |
| 3000:d9ba | speed | 38 | +7 AGI for 60 moves | TOWN / MAGICFNC / CAT | spell_effect |
| 3000:d9e4 | strength_and_speed | 68 | both boosts at once, each extended by 60 moves if it is already running | TOWN / MAGICFNC / CAT | spell_effect |
| 3000:da2c | relocate | 137 | random non-rock, unoccupied square (x 0..78, y 0..103); also used by change_module and by Fighters digging too deep | TOWN / MAGICFNC / CAT | dig_hole, change_module, spell_effect |
| 3000:dab7 | boss_immune_check | 99 | 'NO, THAT SILLY SPELL DOESN'T WORK ON ME' | TOWN / MAGICFNC / CAT | go_away, autokill, drain_monster, spell_effect |
| 3000:db1e | go_away | 247 | teleports the monster | TOWN / MAGICFNC / CAT | spell_effect |
| 3000:dc18 | autokill | 283 | the autokill roll | TOWN / MAGICFNC / CAT | spell_effect |
| 3000:dd37 | msg_sixty_moves_longer | 45 | re-casting extended the spell by 60 moves | TOWN / MAGICFNC / CAT | power_weapon, protection |
| 3000:dd64 | power_weapon | 99 | Power Weapon I to III: sets the power-weapon level (save 0x7e8) and its 60-move clock | TOWN / MAGICFNC / CAT | spell_effect |
| 3000:ddc9 | protection | 99 | Minor/Major/Ultra Protection: sets the protection level and its 60-move clock | TOWN / MAGICFNC / CAT | spell_effect |
| 3000:de2e | resist_poison | 53 | 60 moves | TOWN / MAGICFNC / CAT | spell_effect |
| 3000:de65 | resist_disease | 53 | 60 moves | TOWN / MAGICFNC / CAT | spell_effect |
| 3000:de9c | anti_cold | 53 | 60 moves | TOWN / MAGICFNC / CAT | spell_effect |
| 3000:ded3 | anti_fire | 53 | 60 moves | TOWN / MAGICFNC / CAT | spell_effect |
| 3000:df0a | resist_drain | 53 | 60 moves | TOWN / MAGICFNC / CAT | spell_effect |
| 3000:df41 | drain_monster | 192 | level -= wis or kill | TOWN / MAGICFNC / CAT | spell_effect |
| 3000:e003 | pass_wall | 423 | moves the player through a wall | TOWN / MAGICFNC / CAT | spell_effect |
| 3000:e1b8 | spell_effect | 5541 | the big switch: every spell's effect | TOWN / MAGICFNC / CAT | cast_a_spell |
| 4000:0001 | FUN_4000_0001 | 52 |  | DISP (graphics) | FUN_4000_0035 |
| 4000:0035 | FUN_4000_0035 | 1637 |  | DISP (graphics) | FUN_4000_069a |
| 4000:069a | FUN_4000_069a | 491 |  | DISP (graphics) | FUN_3000_342d, FUN_3000_9026, title_screen, monster_manual, FUN_4000_0885, FUN_4000_0923 … |
| 4000:0885 | FUN_4000_0885 | 158 |  | DISP (graphics) | g_store, temple, flea_inn, bank |
| 4000:0923 | FUN_4000_0923 | 56 |  | DISP (graphics) |  |
| 4000:095b | FUN_4000_095b | 74 |  | DISP (graphics) | FUN_2000_1598 |
| 4000:09a5 | FUN_4000_09a5 | 282 |  | DISP (graphics) | pfont, psfont, typed_name, FUN_4000_580e, FUN_4000_593f |
| 4000:0abf | load_font | 244 | .FNT loader | DISP (graphics) | FUN_2000_1c5b |
| 4000:0bb3 | pfont | 517 | print text at x,y | DISP (graphics) | FUN_2000_04d3, mset_gmenu, FUN_2000_2f5d, load_section_pictures, show_money, g_store … |
| 4000:0db8 | psfont | 422 | print text with wrapping | DISP (graphics) | FUN_2000_3e73, defend, view_battle_spells, draw_ladder_prompt, FUN_2000_ac9e, cast_a_spell … |
| 4000:0f5e | FUN_4000_0f5e | 54 |  | DISP (graphics) | erase_menu_block |
| 4000:0f94 | FUN_4000_0f94 | 44 |  | DISP (graphics) | gmode |
| 4000:0fc0 | gmode | 109 | set graphics mode | DISP (graphics) | FUN_2000_04b7, FUN_2000_1598, load_section_pictures, load_player, load_level_screen, quit_game |
| 4000:102d | set_ega_colour | 87 | one of the 16 base colours | DISP (graphics) | FUN_2000_1b61, set_palette |
| 4000:1084 | FUN_4000_1084 | 62 |  | DISP (graphics) |  |
| 4000:10c2 | apply_palette | 142 | send the 256-entry palette to the DAC | DISP (graphics) | shade_palette, set_palette |
| 4000:1150 | gradient_palette | 371 | entries 96..255 ramps per section | DISP (graphics) | set_palette |
| 4000:12c3 | set_palette | 5120 | builds the whole palette for the current section/building | DISP (graphics) | main, load_level_map, movecontrol, FUN_3000_7dfc, FUN_3000_9026, title_screen … |
| 4000:26d3 | FUN_4000_26d3 | 78 |  | DISP (graphics) | FUN_4000_2b29, FUN_4000_2d90 |
| 4000:2721 | FUN_4000_2721 | 64 |  | DISP (graphics) | FUN_4000_2b60, FUN_4000_2d90 |
| 4000:2761 | FUN_4000_2761 | 57 |  | DISP (graphics) | FUN_4000_2b97, FUN_4000_2d90 |
| 4000:279a | FUN_4000_279a | 110 |  | DISP (graphics) | fill_rect |
| 4000:2808 | FUN_4000_2808 | 110 |  | DISP (graphics) | FUN_4000_28d3 |
| 4000:2876 | FUN_4000_2876 | 93 |  | DISP (graphics) | FUN_4000_28d3 |
| 4000:28d3 | FUN_4000_28d3 | 355 |  | DISP (graphics) |  |
| 4000:2a36 | fill_rect | 142 | solid rectangle | DISP (graphics) | FUN_2000_1d4f, FUN_2000_20db, FUN_2000_295b, FUN_2000_3e73, FUN_2000_4054, FUN_2000_a068 … |
| 4000:2ac4 | FUN_4000_2ac4 | 45 |  | DISP (graphics) |  |
| 4000:2af1 | FUN_4000_2af1 | 56 |  | DISP (graphics) |  |
| 4000:2b29 | FUN_4000_2b29 | 55 |  | DISP (graphics) |  |
| 4000:2b60 | FUN_4000_2b60 | 55 |  | DISP (graphics) |  |
| 4000:2b97 | FUN_4000_2b97 | 55 |  | DISP (graphics) |  |
| 4000:2bce | FUN_4000_2bce | 51 |  | DISP (graphics) |  |
| 4000:2c01 | FUN_4000_2c01 | 51 |  | DISP (graphics) |  |
| 4000:2c34 | FUN_4000_2c34 | 46 |  | DISP (graphics) |  |
| 4000:2c62 | FUN_4000_2c62 | 46 |  | DISP (graphics) |  |
| 4000:2c90 | FUN_4000_2c90 | 198 |  | DISP (graphics) |  |
| 4000:2d56 | FUN_4000_2d56 | 58 |  | DISP (graphics) |  |
| 4000:2d90 | FUN_4000_2d90 | 2180 |  | DISP (graphics) | FUN_2000_3e73, monster_manual, FUN_4000_3c20, FUN_4000_40aa |
| 4000:38db | FUN_4000_38db | 229 |  | DISP (graphics) | main |
| 4000:39c0 | mouse_detect | 50 | int86(0x33) reset/detect; returns button count or 0 | DISP (graphics) | main, FUN_2000_c200, movecontrol |
| 4000:39f8 | FUN_4000_39f8 | 58 |  | DISP (graphics) | FUN_4000_3c20 |
| 4000:3a38 | FUN_4000_3a38 | 69 |  | DISP (graphics) | FUN_2000_2a2e, mset_gmenu, get_choice, cast_a_spell, FUN_3000_7dfc, monster_manual … |
| 4000:3a81 | FUN_4000_3a81 | 91 |  | DISP (graphics) | main, FUN_4000_3c20 |
| 4000:3adc | FUN_4000_3adc | 39 |  | DISP (graphics) | FUN_2000_3e73, FUN_2000_4054, FUN_4000_3c20, FUN_4000_40aa |
| 4000:3b05 | FUN_4000_3b05 | 39 |  | DISP (graphics) | FUN_2000_3e73, FUN_2000_4054, FUN_4000_3c20, FUN_4000_40aa |
| 4000:3b2e | FUN_4000_3b2e | 22 |  | DISP (graphics) | mset_gmenu, get_choice, cast_a_spell, FUN_3000_7dfc, monster_manual, write_scroll_or_wand … |
| 4000:3b44 | FUN_4000_3b44 | 190 |  | DISP (graphics) | FUN_2000_2a2e, mset_gmenu, get_choice, movecontrol, cast_a_spell, FUN_3000_7dfc … |
| 4000:3c02 | FUN_4000_3c02 | 28 |  | DISP (graphics) | FUN_4000_3c20 |
| 4000:3c20 | FUN_4000_3c20 | 1154 |  | DISP (graphics) | mset_gmenu, get_choice, select_player, movecontrol, cast_a_spell, roll_char … |
| 4000:40aa | FUN_4000_40aa | 152 |  | DISP (graphics) | FUN_4000_415e |
| 4000:4142 | FUN_4000_4142 | 28 |  | DISP (graphics) |  |
| 4000:415e | FUN_4000_415e | 29 |  | DISP (graphics) | mset_gmenu, get_choice, select_player, movecontrol, cast_a_spell, roll_char … |
| 4000:417b | FUN_4000_417b | 16 |  | DISP (graphics) | FUN_2000_2a2e, mset_gmenu, get_choice, select_player, strike, movecontrol … |
| 4000:418d | mgetch_message | 83 | wait for a key in the message box | DISP (graphics) | g_store, show_registration_notice, quit_game, movecontrol, roll_char, boss_office_message … |
| 4000:41e5 | FUN_4000_41e5 | 62 |  | DISP (graphics) | movecontrol, title_screen, module_transition_screen |
| 4000:4225 | FUN_4000_4225 | 143 |  | DISP (graphics) | FUN_2000_03d4, mset_gmenu, get_choice, main, movecontrol |
| 4000:42b4 | erase_menu_block | 90 | clears the menu area | DISP (graphics) | FUN_2000_1598, main, quit_game, change_module, movecontrol, roll_char … |
| 4000:430e | erase_message_block | 48 | clears the message line | DISP (graphics) | mset_gmenu, FUN_2000_2f5d, FUN_2000_4054, FUN_2000_412a, show_money, g_store … |
| 4000:433e | FUN_4000_433e | 1240 |  | DISP (graphics) | FUN_2000_4506, draw_map_square, boss_office_message, FUN_3000_9026, title_screen |
| 4000:4818 | scale_image2 | 1909 | draws a .PIC image scaled into a rectangle | DISP (graphics) | FUN_2000_3e73, select_player, draw_ladder_prompt, movecontrol, draw_3d_view, draw_map_square … |
| 4000:4f8f | FUN_4000_4f8f | 1557 |  | DISP (graphics) | FUN_3000_342d |
| 4000:55b2 | typed_name | 598 | reads a typed string into a buffer: letters, digits and the space bar, backspace, Enter or Escape | DISP (graphics) | g_store, bank, roll_char |
| 4000:580e | FUN_4000_580e | 305 |  | DISP (graphics) | roll_char |
| 4000:593f | FUN_4000_593f | 291 |  | DISP (graphics) | mset_gmenu, FUN_2000_2f5d, roll_char |
| 4000:5a62 | FUN_4000_5a62 | 35 |  | DISP (graphics) | view_stats |
| 4000:5a87 | num_to_string | 63 | sprintf-like number formatting | DISP (graphics) | store_refund, show_money, g_store, temple, view_prep_spells, view_battle_spells … |
| 4000:5aca | FUN_4000_5aca | 113 |  | DISP (graphics) | roll_char, FUN_3000_caac |
| 4000:5b3f | FUN_4000_5b3f | 82 |  | DISP (graphics) | FUN_3000_9026, title_screen |
| 4000:5b91 | FUN_4000_5b91 | 148 |  | DISP (graphics) | FUN_3000_9026, title_screen |
| 4000:5c25 | FUN_4000_5c25 | 148 |  | DISP (graphics) | movecontrol, FUN_3000_9026, title_screen |
| 4000:5cb9 | FUN_4000_5cb9 | 401 |  | DISP (graphics) |  |
| 4000:5e4a | FUN_4000_5e4a | 394 |  | DISP (graphics) |  |
| 4000:5fd4 | FUN_4000_5fd4 | 368 |  | DISP (graphics) |  |
| 4000:6144 | FUN_4000_6144 | 472 |  | DISP (graphics) |  |
| 4000:631c | FUN_4000_631c | 863 |  | DISP (graphics) | FUN_2000_ac9e |
| 4000:667b | FUN_4000_667b | 1103 |  | DISP (graphics) | movecontrol |
| 4000:6aca | drop_money | 2396 | Greater American Dollars on a kill | DISP (graphics) | kill_monster |
| 4000:7426 | FUN_4000_7426 | 245 |  | DISP (graphics) | select_player |
| 4000:751b | shareware_plea_screen | 512 | the 'DELETE THE FILE INTRO.TXT' shareware screen; no callers in the registered build (dead code) | DISP (graphics) |  |
| 4000:771b | module_transition_screen | 2302 | shown by change_module | DISP (graphics) | change_module |
| 5000:0006 | FUN_5000_0006 | 326 |  | DISP low-level | FUN_5000_0176, FUN_5000_01d2, FUN_5000_0522, FUN_5000_0cc2, FUN_5000_0d73 |
| 5000:0153 | FUN_5000_0153 | 35 |  | DISP low-level | FUN_5000_01d2, FUN_5000_037e, FUN_5000_0cc2, FUN_5000_0d73 |
| 5000:0176 | FUN_5000_0176 | 92 |  | DISP low-level |  |
| 5000:01d2 | FUN_5000_01d2 | 335 |  | DISP low-level | FUN_2000_0923 |
| 5000:037e | FUN_5000_037e | 420 |  | DISP low-level |  |
| 5000:0522 | FUN_5000_0522 | 361 |  | DISP low-level | FUN_5000_037e |
| 5000:068b | FUN_5000_068b | 12 |  | DISP low-level | FUN_5000_037e |
| 5000:0697 | FUN_5000_0697 | 44 |  | DISP low-level | FUN_5000_06d6 |
| 5000:06c3 | FUN_5000_06c3 | 19 |  | DISP low-level | FUN_5000_06d6 |
| 5000:06d6 | FUN_5000_06d6 | 17 |  | DISP low-level | FUN_5000_06e7 |
| 5000:06e7 | FUN_5000_06e7 | 173 |  | DISP low-level |  |
| 5000:07c4 | FUN_5000_07c4 | 39 |  | DISP low-level | draw_line, FUN_5000_097e, FUN_5000_0e26, FUN_5000_0ebf |
| 5000:07eb | draw_line | 290 | Bresenham line in planar video memory | DISP low-level | FUN_2000_0855 |
| 5000:097e | FUN_5000_097e | 32 |  | DISP low-level | FUN_2000_08bf |
| 5000:099e | FUN_5000_099e | 35 |  | DISP low-level | FUN_5000_09c1, FUN_5000_0b4f, FUN_5000_0f5d, FUN_5000_0fe8 |
| 5000:09c1 | FUN_5000_09c1 | 287 |  | DISP low-level | FUN_2000_07cb |
| 5000:0b4f | FUN_5000_0b4f | 34 |  | DISP low-level |  |
| 5000:0b71 | FUN_5000_0b71 | 61 |  | DISP low-level | FUN_2000_1598 |
| 5000:0bae | FUN_5000_0bae | 34 |  | DISP low-level |  |
| 5000:0bd0 | FUN_5000_0bd0 | 34 |  | DISP low-level |  |
| 5000:0bf2 | FUN_5000_0bf2 | 48 |  | DISP low-level |  |
| 5000:0c58 | FUN_5000_0c58 | 14 |  | DISP low-level | FUN_5000_0bf2 |
| 5000:0cc2 | FUN_5000_0cc2 | 177 |  | DISP low-level |  |
| 5000:0d73 | FUN_5000_0d73 | 179 |  | DISP low-level |  |
| 5000:0e26 | FUN_5000_0e26 | 153 |  | DISP low-level | FUN_4000_2c34 |
| 5000:0ebf | FUN_5000_0ebf | 158 |  | DISP low-level | FUN_4000_2bce, FUN_4000_2d90 |
| 5000:0f5d | FUN_5000_0f5d | 139 |  | DISP low-level | FUN_4000_2c62 |
| 5000:0fe8 | FUN_5000_0fe8 | 170 |  | DISP low-level | FUN_4000_2c01, FUN_4000_2d90 |
| 5110:0008 | FUN_5110_0008 | 62 |  | DISP low-level | FUN_2000_1598, erase_menu_block |
| 5110:0046 | FUN_5110_0046 | 49 |  | DISP low-level |  |
| 5110:0077 | FUN_5110_0077 | 45 |  | DISP low-level | FUN_4000_2761 |
| 5110:00a4 | FUN_5110_00a4 | 55 |  | DISP low-level | FUN_4000_3b44, FUN_4000_5b3f, FUN_4000_5b91, FUN_4000_5c25 |
| 5120:0012 | FUN_5120_0012 | 132 |  | video drivers | FUN_5120_00f3, FUN_5120_02bd, FUN_5120_048a, FUN_5120_0805 |
| 5120:00ef | FUN_5120_00ef | 4 |  | video drivers | FUN_5120_1826 |
| 5120:00f3 | FUN_5120_00f3 | 463 |  | video drivers | FUN_5120_0805, FUN_5120_1826, FUN_5120_1b96 |
| 5120:02bd | FUN_5120_02bd | 234 |  | video drivers | FUN_5120_1826, FUN_5120_18d9, FUN_5120_1b5d, FUN_5120_1b96 |
| 5120:0353 | FUN_5120_0353 | 225 |  | video drivers | FUN_5120_02bd, FUN_5120_154e |
| 5120:048a | FUN_5120_048a | 973 |  | video drivers | FUN_5120_0805, FUN_5120_1826, FUN_5120_1b96 |
| 5120:0805 | FUN_5120_0805 | 80 |  | video drivers |  |
| 5120:085a | FUN_5120_085a | 111 |  | video drivers | FUN_5120_0805 |
| 5120:08d1 | FUN_5120_08d1 | 219 |  | video drivers |  |
| 5120:09d9 | FUN_5120_09d9 | 237 |  | video drivers | FUN_5120_1826 |
| 5120:0dc1 | FUN_5120_0dc1 | 5 |  | video drivers | FUN_5120_1826, FUN_5120_1b96 |
| 5120:0e27 | FUN_5120_0e27 | 22 |  | video drivers | FUN_5120_0805 |
| 5120:0e3d | FUN_5120_0e3d | 22 |  | video drivers | FUN_5120_02bd, FUN_5120_048a, FUN_5120_1013 |
| 5120:0e53 | FUN_5120_0e53 | 24 |  | video drivers | FUN_5120_00f3, FUN_5120_02bd, FUN_5120_048a |
| 5120:0e6b | FUN_5120_0e6b | 28 |  | video drivers | FUN_5120_0805, FUN_5120_18d9, FUN_5120_1b5d |
| 5120:0e87 | FUN_5120_0e87 | 29 |  | video drivers | FUN_5120_154e, FUN_5120_1826, FUN_5120_1b5d |
| 5120:0ea4 | FUN_5120_0ea4 | 22 |  | video drivers | FUN_5120_18d9 |
| 5120:0eba | FUN_5120_0eba | 29 |  | video drivers | FUN_5120_1b96 |
| 5120:1013 | FUN_5120_1013 | 106 |  | video drivers |  |
| 5120:1446 | FUN_5120_1446 | 264 |  | video drivers | FUN_5120_18d9, FUN_5120_1b96 |
| 5120:154e | FUN_5120_154e | 237 |  | video drivers | FUN_5120_18d9, FUN_5120_1b96 |
| 5120:1826 | FUN_5120_1826 | 179 |  | video drivers |  |
| 5120:18d9 | FUN_5120_18d9 | 55 |  | video drivers | FUN_5120_1826 |
| 5120:1b5d | FUN_5120_1b5d | 57 |  | video drivers |  |
| 5120:1b96 | FUN_5120_1b96 | 87 |  | video drivers | FUN_5120_1b5d |
| 5120:1eb8 | FUN_5120_1eb8 | 47 |  | video drivers | FUN_5120_1ee7 |
| 5120:1ee7 | FUN_5120_1ee7 | 203 |  | video drivers |  |
| 5120:1fb2 | FUN_5120_1fb2 | 30 |  | video drivers | FUN_5120_1fd0 |
| 5120:1fd0 | FUN_5120_1fd0 | 204 |  | video drivers |  |
| 5120:2714 | FUN_5120_2714 | 99 |  | video drivers | FUN_5120_0012, FUN_5120_00f3, FUN_5120_02bd, FUN_5120_048a, FUN_5120_0805, FUN_5120_09d9 … |
| 5400:02f0 | FUN_5400_02f0 | 22 |  | video drivers | FUN_5400_0306 |
| 5400:0306 | FUN_5400_0306 | 170 |  | video drivers |  |
