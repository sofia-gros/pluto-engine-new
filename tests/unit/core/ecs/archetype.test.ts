import { describe, expect, it } from 'vitest';
import { Archetype } from '../../../../src/core/ecs/archetype';
import { defineComponent } from '../../../../src/core/ecs/component';
import { INITIAL_ARCHETYPE_ROWS } from '../../../../src/core/ecs/column';
import { NULL_ENTITY, makeEntity } from '../../../../src/core/ecs/entity';
import { ScalarType } from '../../../../src/core/memory/scalar-type';
import { PlutoError } from '../../../../src/core/debug/pluto-error';

const Pos = defineComponent('Pos', { x: ScalarType.F32, y: ScalarType.F32 });
const Hp = defineComponent('Hp', { hp: ScalarType.I32 });
const Other = defineComponent('Other', { o: ScalarType.U8 });

/**
 * 追加した行の dirty 範囲を集める。
 * @param a アーキタイプ
 * @param fieldId フィールド ID
 * @returns [start, end] の配列
 */
function dirty(a: Archetype, fieldId: number): number[][] {
  const out: number[][] = [];
  a.changeTracker.forEachDirtyRange(fieldId, a.count, (s, e) => out.push([s, e]));
  return out;
}

describe('Archetype', () => {
  it('pushRow はゼロ初期化した行を追加し、全フィールドの新しい行を dirty にする', () => {
    const a = new Archetype(1, [Pos, Hp], 100);
    const row = a.pushRow(makeEntity(3, 0));
    expect(row).toBe(0);
    expect(a.count).toBe(1);
    expect(a.entities[0]).toBe(makeEntity(3, 0));
    expect(a.getColumn(Pos.x)[0]).toBe(0);
    expect(dirty(a, Pos.x.fieldId)).toEqual([[0, 1]]);
    expect(dirty(a, Hp.hp.fieldId)).toEqual([[0, 1]]);
  });

  it('pushRows は開始行を返し、count 行をゼロ初期化して 1 範囲だけ dirty にする', () => {
    const a = new Archetype(1, [Pos, Hp], 100);
    const start = a.pushRows(70);
    expect(start).toBe(0);
    expect(a.count).toBe(70);
    for (let i = 0; i < 70; i++) {
      expect(a.entities[i]).toBe(0); // writeEntityRow するまでは NULL_ENTITY 相当
      expect(a.getColumn(Pos.x)[i]).toBe(0);
      expect(a.getColumn(Hp.hp)[i]).toBe(0);
    }
    // markRange をフィールドごとに 1 回しか呼ばないので 64 行ブロック 2 個が 1 範囲に結合される
    expect(dirty(a, Pos.x.fieldId)).toEqual([[0, 70]]);
    expect(dirty(a, Hp.hp.fieldId)).toEqual([[0, 70]]);
  });

  it('pushRows は既存の行の後に連結し、writeEntityRow で Entity を書き込む', () => {
    const a = new Archetype(1, [Hp], 100);
    a.pushRow(makeEntity(7, 0));
    expect(a.pushRows(3)).toBe(1);
    expect(a.count).toBe(4);
    a.writeEntityRow(2, makeEntity(8, 0));
    expect(a.entities[1]).toBe(0);
    expect(a.entities[2]).toBe(makeEntity(8, 0));
    expect(dirty(a, Hp.hp.fieldId)).toEqual([[0, 4]]);
  });

  it('pushRows は初期行数を超えて伸長しても之前的データと Entity が保たれる', () => {
    const a = new Archetype(1, [Hp], 10_000);
    a.pushRow(makeEntity(5, 0));
    a.getColumn(Hp.hp)[0] = 55;
    expect(a.pushRows(INITIAL_ARCHETYPE_ROWS + 10)).toBe(1);
    expect(a.getColumn(Hp.hp)[0]).toBe(55);
    expect(a.entities[0]).toBe(makeEntity(5, 0));
    expect(a.count).toBe(INITIAL_ARCHETYPE_ROWS + 11);
    expect(dirty(a, Hp.hp.fieldId)).toEqual([[0, INITIAL_ARCHETYPE_ROWS + 11]]);
  });

  it('pushRows は 0 以下・最大行数超過・ミラーで assert が失敗する', () => {
    const a = new Archetype(1, [Pos], 10);
    expect(() => a.pushRows(0)).toThrow(PlutoError);
    expect(() => a.pushRows(-1)).toThrow(PlutoError);
    expect(() => a.pushRows(11)).toThrow(PlutoError);
    const mirror = Archetype.fromShared(a.toShared());
    expect(() => mirror.pushRows(1)).toThrow(PlutoError);
    expect(() => {
      mirror.writeEntityRow(0, makeEntity(0, 0));
    }).toThrow(PlutoError);
  });

  it('swapRemove は最終行を穴に移し、移動したエンティティを返す。末尾なら NULL_ENTITY', () => {
    const a = new Archetype(1, [Hp], 10);
    for (let i = 0; i < 3; i++) {
      const r = a.pushRow(makeEntity(i, 0));
      a.getColumn(Hp.hp)[r] = i * 10;
    }
    expect(a.swapRemove(0)).toBe(makeEntity(2, 0));
    expect(a.getColumn(Hp.hp)[0]).toBe(20);
    expect(a.count).toBe(2);
    expect(a.swapRemove(1)).toBe(NULL_ENTITY);
    expect(a.count).toBe(1);
  });

  it('copyRowTo は共通フィールドだけをコピーする', () => {
    const src = new Archetype(1, [Pos, Hp], 10);
    const dst = new Archetype(2, [Pos, Other], 10);
    const r = src.pushRow(makeEntity(0, 0));
    src.getColumn(Pos.x)[r] = 7;
    src.getColumn(Hp.hp)[r] = 9;
    const d = dst.pushRow(makeEntity(0, 0));
    src.copyRowTo(r, dst, d);
    expect(dst.getColumn(Pos.x)[d]).toBe(7);
    expect(dst.getColumn(Other.o)[d]).toBe(0);
  });

  it('INITIAL_ARCHETYPE_ROWS を超えて伸長してもデータが保たれ、bufferVersion が進んで通知が呼ばれる', () => {
    const grown: number[] = [];
    const a = new Archetype(1, [Hp], 10_000, undefined, (arch) => grown.push(arch.bufferVersion));
    const oldEntities = a.entities;
    for (let i = 0; i < INITIAL_ARCHETYPE_ROWS + 10; i++) {
      const r = a.pushRow(makeEntity(i, 0));
      a.getColumn(Hp.hp)[r] = i;
    }
    expect(a.bufferVersion).toBe(1);
    expect(grown).toEqual([1]);
    expect(a.entities).not.toBe(oldEntities);
    expect(a.getColumn(Hp.hp)[5]).toBe(5);
    expect(a.getColumn(Hp.hp)[INITIAL_ARCHETYPE_ROWS + 5]).toBe(INITIAL_ARCHETYPE_ROWS + 5);
    expect(a.entities[INITIAL_ARCHETYPE_ROWS + 5]).toBe(makeEntity(INITIAL_ARCHETYPE_ROWS + 5, 0));
  });

  it('ミラーは rebindShared でメインの伸長後のバッファに追従する (同じオブジェクトのまま)', () => {
    const a = new Archetype(5, [Hp], 10_000);
    a.pushRow(makeEntity(0, 0));
    const mirror = Archetype.fromShared(a.toShared());
    for (let i = 1; i < INITIAL_ARCHETYPE_ROWS + 1; i++) a.pushRow(makeEntity(i, 0));
    a.getColumn(Hp.hp)[INITIAL_ARCHETYPE_ROWS] = 77;
    mirror.rebindShared(a.toShared());
    expect(mirror.getColumn(Hp.hp)[INITIAL_ARCHETYPE_ROWS]).toBe(77);
    expect(mirror.entities[INITIAL_ARCHETYPE_ROWS]).toBe(makeEntity(INITIAL_ARCHETYPE_ROWS, 0));
    expect(() => {
      a.rebindShared(a.toShared());
    }).toThrow(PlutoError);
  });

  it('hasComponent はマスクで判定する', () => {
    const a = new Archetype(1, [Pos], 10);
    expect(a.hasComponent(Pos.id)).toBe(true);
    expect(a.hasComponent(Hp.id)).toBe(false);
  });

  it('最大行数を超える pushRow・範囲外の swapRemove・無いフィールドは assert で失敗する', () => {
    const a = new Archetype(1, [Pos], 1);
    a.pushRow(makeEntity(0, 0));
    expect(() => a.pushRow(makeEntity(1, 0))).toThrow(PlutoError);
    expect(() => a.swapRemove(5)).toThrow(PlutoError);
    expect(() => a.getColumn(Hp.hp)).toThrow(PlutoError);
    expect(a.getColumnByFieldId(Hp.hp.fieldId)).toBeUndefined();
  });

  it('fromShared で作ったミラーは同じバッファを共有し、構造変更は禁止', () => {
    const a = new Archetype(5, [Pos, Hp], 5000);
    for (let i = 0; i < 2000; i++) a.pushRow(makeEntity(i, 0));
    const mirror = Archetype.fromShared(a.toShared());
    expect(mirror.id).toBe(5);
    expect(mirror.isMirror).toBe(true);
    expect(mirror.hasComponent(Hp.id)).toBe(true);
    a.getColumn(Hp.hp)[1999] = 42;
    expect(mirror.getColumn(Hp.hp)[1999]).toBe(42);
    expect(mirror.entities[1999]).toBe(makeEntity(1999, 0));
    mirror.count = a.count;
    mirror.changeTracker.markRange(Hp.hp.fieldId, 0, 1);
    expect(dirty(a, Hp.hp.fieldId)[0]).toEqual([0, 2000]);
    expect(() => mirror.pushRow(makeEntity(0, 0))).toThrow(PlutoError);
    expect(() => mirror.swapRemove(0)).toThrow(PlutoError);
  });
});
