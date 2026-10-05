import { describe, expect, it } from 'vitest';
import { RingBuffer } from '../../../../src/core/memory/ring-buffer';

describe('RingBuffer', () => {
  it('initializes correctly', () => {
    const data = new Uint8Array(5);
    const rb = new RingBuffer(data);
    expect(rb.capacity).toBe(5);
    expect(rb.size()).toBe(0);
    expect(rb.isEmpty()).toBe(true);
    expect(rb.isFull()).toBe(false);
  });

  it('pushes and shifts values', () => {
    const rb = new RingBuffer(new Uint8Array(3));
    expect(rb.push(10)).toBe(true);
    expect(rb.push(20)).toBe(true);
    expect(rb.size()).toBe(2);

    expect(rb.shift()).toBe(10);
    expect(rb.size()).toBe(1);

    expect(rb.push(30)).toBe(true);
    expect(rb.push(40)).toBe(true); // 満杯になる
    expect(rb.isFull()).toBe(true);

    expect(rb.push(50)).toBe(false); // これ以上は追加できない

    expect(rb.shift()).toBe(20);
    expect(rb.shift()).toBe(30);
    expect(rb.shift()).toBe(40);
    expect(rb.isEmpty()).toBe(true);
    expect(rb.shift()).toBe(0); // 空の場合は0を返す
  });
});
