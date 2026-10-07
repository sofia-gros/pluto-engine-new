import { describe, expect, it } from 'vitest';
import { World } from '../../../src/core/ecs/world';
import { SerialScheduler } from '../../../src/jobs/serial-scheduler';
import { Phase } from '../../../src/core/ecs/system';
import { ScalarType } from '../../../src/core/memory/scalar-type';
import { Transform, WorldTransform } from '../../../src/transform/transform-components';
import { RootWorldTransformKernel } from '../../../src/transform/transform-kernels';

/** 深さ 0 のカーネルを実際に走らせる World を用意する。 */
function makeWorld(count: number): World {
  const w = new World({ maxEntities: count + 1 });
  w.setExecutor(new SerialScheduler());
  w.addSystem({
    name: 'root-world-transform',
    phase: Phase.PostUpdate,
    query: { all: [Transform, WorldTransform] },
    kernel: RootWorldTransformKernel,
  });
  return w;
}

describe('RootWorldTransformKernel', () => {
  it('深さ 0 のワールド行列は単位行列と平行移動になる (回転・スケールなし)', () => {
    const w = makeWorld(1);
    const e = w.spawn(Transform, WorldTransform);
    w.set(e, Transform.x, 3);
    w.set(e, Transform.y, -2);
    // spawn 直後のフィールドは 0 なので、スケールを明示的に 1 にする
    w.set(e, Transform.scaleX, 1);
    w.set(e, Transform.scaleY, 1);
    w.runPhase(Phase.PostUpdate, 1);
    expect(w.get(e, WorldTransform.a)).toBeCloseTo(1, 6);
    expect(w.get(e, WorldTransform.b)).toBeCloseTo(0, 6);
    expect(w.get(e, WorldTransform.c)).toBeCloseTo(0, 6);
    expect(w.get(e, WorldTransform.d)).toBeCloseTo(1, 6);
    expect(w.get(e, WorldTransform.tx)).toBeCloseTo(3, 6);
    expect(w.get(e, WorldTransform.ty)).toBeCloseTo(-2, 6);
  });

  it('回転は (cos, sin, -sin, cos) の行列になる', () => {
    const w = makeWorld(1);
    const e = w.spawn(Transform, WorldTransform);
    const angle = 0.7;
    w.set(e, Transform.rotation, angle);
    w.set(e, Transform.scaleX, 1);
    w.set(e, Transform.scaleY, 1);
    w.runPhase(Phase.PostUpdate, 1);
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    expect(w.get(e, WorldTransform.a)).toBeCloseTo(c, 6);
    expect(w.get(e, WorldTransform.b)).toBeCloseTo(s, 6);
    expect(w.get(e, WorldTransform.c)).toBeCloseTo(-s, 6);
    expect(w.get(e, WorldTransform.d)).toBeCloseTo(c, 6);
  });

  it('非等倍スケールは各軸の列に掛かる', () => {
    const w = makeWorld(1);
    const e = w.spawn(Transform, WorldTransform);
    w.set(e, Transform.scaleX, 2);
    w.set(e, Transform.scaleY, 3);
    w.runPhase(Phase.PostUpdate, 1);
    expect(w.get(e, WorldTransform.a)).toBeCloseTo(2, 6);
    expect(w.get(e, WorldTransform.b)).toBeCloseTo(0, 6);
    expect(w.get(e, WorldTransform.c)).toBeCloseTo(0, 6);
    expect(w.get(e, WorldTransform.d)).toBeCloseTo(3, 6);
  });

  it('複数のエンティティをまとめて計算できる', () => {
    const w = makeWorld(3);
    const e1 = w.spawn(Transform, WorldTransform);
    const e2 = w.spawn(Transform, WorldTransform);
    const e3 = w.spawn(Transform, WorldTransform);
    w.set(e1, Transform.scaleX, 1);
    w.set(e1, Transform.scaleY, 1);
    w.set(e2, Transform.scaleX, 1);
    w.set(e2, Transform.scaleY, 1);
    w.set(e3, Transform.scaleX, 1);
    w.set(e3, Transform.scaleY, 1);
    w.set(e1, Transform.x, 1);
    w.set(e2, Transform.x, 2);
    w.set(e3, Transform.x, 3);
    w.runPhase(Phase.PostUpdate, 1);
    expect(w.get(e1, WorldTransform.tx)).toBeCloseTo(1, 6);
    expect(w.get(e2, WorldTransform.tx)).toBeCloseTo(2, 6);
    expect(w.get(e3, WorldTransform.tx)).toBeCloseTo(3, 6);
  });

  it('CHUNK_ROWS を超える行でもチャンク分割して計算できる', () => {
    const count = 16384 + 100; // CHUNK_ROWS を 1 ブロックだけ超える
    const w = makeWorld(count);
    for (let i = 0; i < count; i++) {
      const e = w.spawn(Transform, WorldTransform);
      w.set(e, Transform.x, i);
    }
    const q = w.query({ all: [Transform, WorldTransform] });
    expect(q.chunkCount()).toBe(2);
    w.runPhase(Phase.PostUpdate, 1);
    // 各エンティティの tx が自分のローカル x と一致することを確認する
    let checked = 0;
    q.forEachChunk((view) => {
      const localX = view.column(Transform.x);
      const worldTx = view.column(WorldTransform.tx);
      for (let i = view.start; i < view.end; i++) {
        expect(worldTx[i]).toBeCloseTo(localX[i], 6);
        checked++;
      }
    });
    expect(checked).toBe(count);
  });

  it('WorldTransform を dirty にする (スプライトパックが拾える)', () => {
    const w = makeWorld(1);
    const q = w.query({ all: [Transform, WorldTransform] });
    w.spawn(Transform, WorldTransform);
    w.runPhase(Phase.PostUpdate, 1);
    const arch = q.archetypes[0];
    const ranges: number[][] = [];
    arch.changeTracker.forEachDirtyRange(WorldTransform.a.fieldId, arch.count, (s, e) => {
      ranges.push([s, e]);
    });
    expect(ranges).toEqual([[0, 1]]);
  });

  it('6 フィールドすべてが dirty になる', () => {
    const w = makeWorld(1);
    const q = w.query({ all: [Transform, WorldTransform] });
    w.spawn(Transform, WorldTransform);
    w.runPhase(Phase.PostUpdate, 1);
    const arch = q.archetypes[0];
    for (const field of WorldTransform.fields) {
      const ranges: number[][] = [];
      arch.changeTracker.forEachDirtyRange(field.fieldId, arch.count, (s, e) => {
        ranges.push([s, e]);
      });
      expect(ranges).toEqual([[0, 1]]);
    }
  });

  it('Transform を書き換えても.WorldTransform の型は変わらない (F32 のまま)', () => {
    for (const field of WorldTransform.fields) expect(field.type).toBe(ScalarType.F32);
  });

  it('カーネルとして定義されている (ID は名前の FNV-1a ハッシュ)', () => {
    expect(RootWorldTransformKernel.name).toBe('Transform.RootWorldTransform');
    expect(typeof RootWorldTransformKernel.id).toBe('number');
    expect(typeof RootWorldTransformKernel.fn).toBe('function');
  });
});
