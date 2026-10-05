import { describe, expect, it } from 'vitest';
import { Archetype } from '../../../../src/core/ecs/archetype';
import { defineComponent } from '../../../../src/core/ecs/component';
import { ScalarType } from '../../../../src/core/memory/scalar-type';
import type { Entity } from '../../../../src/core/ecs/entity';
import { NULL_ENTITY } from '../../../../src/core/ecs/entity';

const Transform = defineComponent('Transform', {
  x: ScalarType.F32,
  y: ScalarType.F32,
});
const Velocity = defineComponent('Velocity', {
  dx: ScalarType.F32,
  dy: ScalarType.F32,
});

describe('Archetype', () => {
  it('initializes correctly', () => {
    const arch = new Archetype(0, [Transform], 10000);
    expect(arch.id).toBe(0);
    expect(arch.hasComponent(Transform.id)).toBe(true);
    expect(arch.hasComponent(Velocity.id)).toBe(false);

    const xCol = arch.getColumn(Transform.x);
    expect(xCol).toBeInstanceOf(Float32Array);
  });

  it('pushes rows and handles swapRemove', () => {
    const arch = new Archetype(0, [Transform], 10000);
    const e1 = 100 as Entity;
    const e2 = 200 as Entity;
    const e3 = 300 as Entity;

    const row0 = arch.pushRow(e1);
    const row1 = arch.pushRow(e2);
    const row2 = arch.pushRow(e3);

    expect(row0).toBe(0);
    expect(row1).toBe(1);
    expect(row2).toBe(2);
    expect(arch.count).toBe(3);

    const xCol = arch.getColumn(Transform.x);
    xCol[row0] = 10;
    xCol[row1] = 20;
    xCol[row2] = 30;

    // e1 (row0) を削除する。末尾の e3 (row2) が row0 に移動してくるはず
    const moved = arch.swapRemove(row0);
    expect(moved).toBe(e3);
    expect(arch.count).toBe(2);
    expect(arch.entities[0]).toBe(e3); // e3 が row0 に来た
    expect(xCol[0]).toBe(30); // e3 のデータも row0 に来た

    // 末尾 (row1) を削除する場合、移動はない
    const moved2 = arch.swapRemove(1);
    expect(moved2).toBe(NULL_ENTITY);
    expect(arch.count).toBe(1);
    expect(arch.entities[0]).toBe(e3);
  });

  it('grows entities buffer when capacity exceeded', () => {
    // INITIAL_ARCHETYPE_ROWS は 1024
    const arch = new Archetype(0, [Transform], 1500);
    for (let i = 0; i < 1500; i++) {
      arch.pushRow(i as Entity);
    }
    expect(arch.count).toBe(1500);
    expect(arch.entities.length).toBe(1500); // maxRows でキャップされる
  });

  it('copies row to another archetype', () => {
    const src = new Archetype(0, [Transform, Velocity], 10000);
    const dst = new Archetype(1, [Transform], 10000);

    const srcRow = src.pushRow(100 as Entity);
    const dstRow = dst.pushRow(100 as Entity);

    src.getColumn(Transform.x)[srcRow] = 42;
    src.getColumn(Transform.y)[srcRow] = 99;
    src.getColumn(Velocity.dx)[srcRow] = 5; // dst には存在しない

    src.copyRowTo(srcRow, dst, dstRow);

    expect(dst.getColumn(Transform.x)[dstRow]).toBe(42);
    expect(dst.getColumn(Transform.y)[dstRow]).toBe(99);
  });
});
