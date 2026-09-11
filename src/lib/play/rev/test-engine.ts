import { formatRevRecord, REV_VALUE_COUNT } from '../../game/rev-port/record';
import { type RevCharacterFile } from './engine';

/**
 * A character standing in the town, as the record stores it: a fighter with 22 health points, 40
 * jewel pieces and 150 pounds of weight, standing on 10, 10. `fields` names record values by
 * their number, shifts and all.
 */
export function revRecord(fields: Record<number, number> = {}): Uint8Array<ArrayBuffer> {
  const values = new Array<number>(REV_VALUE_COUNT).fill(0);
  for (let stat = 1; stat <= 6; stat++) values[stat - 1] = 3 * 15 + 237;
  values[10 - 1] = 1;
  values[12 - 1] = 12316;
  values[13 - 1] = 476;
  values[14 - 1] = 376 + 22;
  values[15 - 1] = 176 + 22;
  values[17 - 1] = 71 + 150;
  values[18 - 1] = 4434;
  values[19 - 1] = 223 + 40;
  values[23 - 1] = 10;
  values[24 - 1] = 10;
  values[25 - 1] = 0;
  values[26 - 1] = 1;
  for (const [value, number] of Object.entries(fields)) values[Number(value) - 1] = number;
  return formatRevRecord(values);
}

/** That record as a file a session can be started on, which remembers a death. */
export function revCharacterFile(bytes = revRecord()): RevCharacterFile & { dead: boolean } {
  return {
    bytes,
    dead: false,
    write(next) {
      this.bytes = next;
    },
    died() {
      this.dead = true;
    },
  };
}
