import { describe, expect, it, vi } from 'vitest';
import type * as ComponentApi from '../../../../src/core/ecs/component';
import {
  COMPONENT_REGISTRY,
  MAX_COMPONENTS,
  defineComponent,
} from '../../../../src/core/ecs/component';
import { ScalarType } from '../../../../src/core/memory/scalar-type';
import { ErrorCode, PlutoError } from '../../../../src/core/debug/pluto-error';

describe('defineComponent', () => {
  it('ID・名前・定義順のフィールドトークンを発行し、レジストリに登録する', () => {
    const A = defineComponent('A', { x: ScalarType.F32, flags: ScalarType.U16 });
    expect(A.name).toBe('A');
    expect(A.fields.map((f) => f.name)).toEqual(['x', 'flags']);
    expect(A.x.type).toBe(ScalarType.F32);
    expect(A.x.componentId).toBe(A.id);
    expect(A.flags.fieldId).toBe(A.x.fieldId + 1);
    expect(COMPONENT_REGISTRY[A.id]).toBe(A);
  });

  it('フィールドなしのコンポーネント (タグ) を定義できる', () => {
    const Tag = defineComponent('Tag', {});
    expect(Tag.fields).toHaveLength(0);
  });

  it('予約されたフィールド名 (id / name / fields) は PlutoError(InvalidArgument)', () => {
    for (const bad of ['id', 'name', 'fields']) {
      expect(() => defineComponent('Bad', { [bad]: ScalarType.F32 })).toThrow(
        expect.objectContaining({ code: ErrorCode.InvalidArgument }),
      );
    }
  });

  it('上限 (MAX_COMPONENTS = 256) を超えると PlutoError(CapacityExceeded)', () => {
    let isThrown = false;
    try {
      for (let i = 0; i <= MAX_COMPONENTS; i++) defineComponent(`C${String(i)}`, {});
    } catch (err) {
      isThrown = err instanceof PlutoError && err.code === ErrorCode.CapacityExceeded;
    }
    expect(isThrown).toBe(true);
  });
});

describe('コンポーネント表 (Worker との ID 整合)', () => {
  /**
   * 新しいモジュール状態の component.ts を読み込む (レジストリがテスト間で共有されないように)。
   * @returns component モジュール
   */
  async function freshModule(): Promise<typeof ComponentApi> {
    vi.resetModules();
    return import('../../../../src/core/ecs/component');
  }

  it('同じ名前のコンポーネントは定義できない', async () => {
    const m = await freshModule();
    m.defineComponent('Dup', {});
    expect(() => m.defineComponent('Dup', {})).toThrow(
      expect.objectContaining({ code: ErrorCode.InvalidArgument }),
    );
  });

  it('getComponentLayout は ID 順の名前・フィールド ID・型を返す', async () => {
    const m = await freshModule();
    const P = m.defineComponent('P', { x: ScalarType.F32 });
    const Q = m.defineComponent('Q', { a: ScalarType.U8, b: ScalarType.I32 });
    expect(m.getComponentLayout()).toEqual([
      { name: 'P', id: P.id, fields: [{ name: 'x', fieldId: P.x.fieldId, type: ScalarType.F32 }] },
      {
        name: 'Q',
        id: Q.id,
        fields: [
          { name: 'a', fieldId: Q.a.fieldId, type: ScalarType.U8 },
          { name: 'b', fieldId: Q.b.fieldId, type: ScalarType.I32 },
        ],
      },
    ]);
  });

  it('applyComponentLayout は評価順が違っても同名コンポーネントの ID を表に合わせる (トークンも同じオブジェクトで更新)', async () => {
    const worker = await freshModule();
    // Worker 側では Q → P の順に定義されたとする
    const Q = worker.defineComponent('Q', { a: ScalarType.U8 });
    const P = worker.defineComponent('P', { x: ScalarType.F32 });
    const OnlyWorker = worker.defineComponent('OnlyWorker', { w: ScalarType.U32 });
    const tokenX = P.x;
    worker.applyComponentLayout([
      { name: 'P', id: 0, fields: [{ name: 'x', fieldId: 0, type: ScalarType.F32 }] },
      { name: 'Q', id: 1, fields: [{ name: 'a', fieldId: 1, type: ScalarType.U8 }] },
      { name: 'MainOnly', id: 2, fields: [{ name: 'm', fieldId: 2, type: ScalarType.F32 }] },
    ]);
    expect([P.id, P.x.fieldId, Q.id, Q.a.fieldId]).toEqual([0, 0, 1, 1]);
    expect(tokenX.fieldId).toBe(0);
    expect(tokenX.componentId).toBe(0);
    expect(OnlyWorker.id).toBe(3);
    expect(OnlyWorker.w.fieldId).toBe(3);
    expect(worker.COMPONENT_REGISTRY[0]).toBe(P);
    expect(worker.COMPONENT_REGISTRY[3]).toBe(OnlyWorker);
    expect(worker.defineComponent('Later', {}).id).toBe(4);
  });

  it('同名でフィールド構成が違うと PlutoError(InvalidState)', async () => {
    const m = await freshModule();
    m.defineComponent('P', { x: ScalarType.F32 });
    expect(() => {
      m.applyComponentLayout([
        { name: 'P', id: 0, fields: [{ name: 'x', fieldId: 0, type: ScalarType.I32 }] },
      ]);
    }).toThrow(expect.objectContaining({ code: ErrorCode.InvalidState }));
  });
});
