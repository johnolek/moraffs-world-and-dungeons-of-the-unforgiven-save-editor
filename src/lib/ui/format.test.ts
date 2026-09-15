import { describe, expect, it } from 'vitest';
import { grouped } from './format';

describe('grouped', () => {
  it('groups the thousands of a large number', () => {
    expect(grouped(12345)).toBe('12,345');
    expect(grouped(1234567)).toBe('1,234,567');
  });

  it('leaves a number below a thousand alone', () => {
    expect(grouped(0)).toBe('0');
    expect(grouped(999)).toBe('999');
  });
});
