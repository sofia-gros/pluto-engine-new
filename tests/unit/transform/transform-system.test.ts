import { describe, expect, it } from 'vitest';
import { World } from '../../../src/core/ecs/world';
import { SerialScheduler } from '../../../src/jobs/serial-scheduler';
import { Phase } from '../../../src/core/ecs/system';
import {
  create as affine2dCreate,
  multiply as affine2dMultiply,
} from '../../../src/core/math/affine2d';
import type { Entity } from '../../../src/core/ecs';
import { NULL_ENTITY } from '../../../src/core/ecs/entity';
import {
  HierarchyDepth,
  MAX_HIERARCHY_DEPTH,
  Parent,
  Transform,
  WorldTransform,
} from '../../../src/transform/transform-components';
import {
  TransformHierarchySystem,
  TransformRootSystem,
  composeHierarchicalWorlds,
  degreesToRadians,
} from '../../../src/transform/transform-system';

/** ローカル行列 (回転・スケール・平行移動) を参照実装として作る。 */
function referenceLocal(x: number, y: number, rot: number, sx: number, sy: number): Float32Array {
  const m = affine2dCreate();
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  m[0] = cos * sx;
  m[1] = sin * sx;
  m[2] = -sin * sy;
  m[3] = cos * sy;
  m[4] = x;
  m[5] = y;
  return m;
}

/** 1 つのエンティティのワールド行列を 6 要素の配列として読む。 */
function readWorld(w: World, e: Entity): number[] {
  return [
    w.get(e, WorldTransform.a),
    w.get(e, WorldTransform.b),
    w.get(e, WorldTransform.c),
    w.get(e, WorldTransform.d),
    w.get(e, WorldTransform.tx),
    w.get(e, WorldTransform.ty),
  ];
}

/** 2 つのシステムを登録して走らせられる World を作る。 */
function makeWorld(maxEntities: number): World {
  const w = new World({ maxEntities });
  w.setExecutor(new SerialScheduler());
  w.addSystem(TransformRootSystem);
  w.addSystem(TransformHierarchySystem);
  return w;
}

/** ノードのローカル変換 (深さ以外の省略値は単位変換)。 */
interface NodeLocal {
  /** ローカル X。 */
  x: number;
  /** ローカル Y。 */
  y: number;
  /** ローカル回転 (ラジアン)。 */
  rot: number;
  /** ローカル X スケール。 */
  sx: number;
  /** ローカル Y スケール。 */
  sy: number;
}

/**
 * 1 つのノードを作る。
 * @param w 対象の World
 * @param depth 階層の深さ
 * @param local ローカル変換 (省略フィールドは単位変換)
 * @returns 作ったエンティティ
 */
function makeNode(w: World, depth: number, local: Partial<NodeLocal> = {}): Entity {
  const e = w.spawn(Transform, WorldTransform, Parent, HierarchyDepth);
  w.set(e, Transform.x, local.x ?? 0);
  w.set(e, Transform.y, local.y ?? 0);
  w.set(e, Transform.rotation, local.rot ?? 0);
  w.set(e, Transform.scaleX, local.sx ?? 1);
  w.set(e, Transform.scaleY, local.sy ?? 1);
  w.set(e, HierarchyDepth.depth, depth);
  return e;
}

describe('TransformSystem', () => {
  it('深さ 0 はカーネルシステム、深さ 1 以降は run システムとして定義されている', () => {
    expect(TransformRootSystem.name).toBe('Transform.Root');
    expect(TransformRootSystem.phase).toBe(Phase.PostUpdate);
    expect(TransformRootSystem.kernel).toBeDefined();
    expect(TransformRootSystem.run).toBeUndefined();
    expect(TransformHierarchySystem.name).toBe('Transform.Hierarchy');
    expect(TransformHierarchySystem.phase).toBe(Phase.PostUpdate);
    expect(TransformHierarchySystem.run).toBeDefined();
    expect(TransformHierarchySystem.kernel).toBeUndefined();
  });

  it('深さ 0 のシステム order が階層システムより小さい (親が先に計算される)', () => {
    const rootOrder = TransformRootSystem.order ?? 0;
    const hierarchyOrder = TransformHierarchySystem.order ?? 0;
    expect(rootOrder).toBeLessThan(hierarchyOrder);
  });

  it('深さ 0 はカーネルの結果そのままになる', () => {
    const w = makeWorld(10);
    const e = makeNode(w, 0, { x: 5, y: -3, rot: 0.25 });
    w.runPhase(Phase.PostUpdate, 1);
    const ref = referenceLocal(5, -3, 0.25, 1, 1);
    const got = readWorld(w, e);
    for (let i = 0; i < 6; i++) expect(got[i]).toBeCloseTo(ref[i], 5);
  });

  it('深さ 1 は親のワールド行列とローカル行列の積になる', () => {
    const w = makeWorld(10);
    const parent = makeNode(w, 0, { x: 10 });
    const child = makeNode(w, 1, { x: 2, y: 3 });
    w.set(child, Parent.parent, parent);
    w.runPhase(Phase.PostUpdate, 1);
    const expected = affine2dMultiply(
      affine2dCreate(),
      referenceLocal(10, 0, 0, 1, 1),
      referenceLocal(2, 3, 0, 1, 1),
    );
    const got = readWorld(w, child);
    for (let i = 0; i < 6; i++) expect(got[i]).toBeCloseTo(expected[i], 5);
  });

  it('深さ 8 の階層でも参照実装と 1e-5 以内で一致する (受け入れ条件 2)', () => {
    const w = makeWorld(64);
    const depth = MAX_HIERARCHY_DEPTH;
    let expected = affine2dCreate();
    let parent = NULL_ENTITY;
    let last = NULL_ENTITY;
    for (let d = 0; d <= depth; d++) {
      const rot = 0.11 * (d + 1);
      const x = 1 + d * 0.5;
      const y = -d * 0.25;
      const sx = 1 + d * 0.1;
      const sy = 1 - d * 0.05;
      const node = makeNode(w, d, { x, y, rot, sx, sy });
      if (d > 0) w.set(node, Parent.parent, parent);
      expected = affine2dMultiply(affine2dCreate(), expected, referenceLocal(x, y, rot, sx, sy));
      parent = node;
      last = node;
    }
    w.runPhase(Phase.PostUpdate, 1);
    const got = readWorld(w, last);
    for (let i = 0; i < 6; i++) {
      expect(Math.abs(got[i] - expected[i])).toBeLessThan(1e-5);
    }
  });

  it('回転とスケールの合成が親子の両方でいても正しい', () => {
    const w = makeWorld(10);
    const parent = makeNode(w, 0, { rot: Math.PI / 2, sx: 2, sy: 2 });
    const child = makeNode(w, 1, { x: 1, sx: 3, sy: 3 });
    w.set(child, Parent.parent, parent);
    w.runPhase(Phase.PostUpdate, 1);
    const expected = affine2dMultiply(
      affine2dCreate(),
      referenceLocal(0, 0, Math.PI / 2, 2, 2),
      referenceLocal(1, 0, 0, 3, 3),
    );
    const got = readWorld(w, child);
    for (let i = 0; i < 6; i++) expect(got[i]).toBeCloseTo(expected[i], 5);
    // 親が 90 度回転 + 2 倍スケールなので、子のローカル点 (1,0) は (0,2) になる
    expect(got[4]).toBeCloseTo(0, 5);
    expect(got[5]).toBeCloseTo(2, 5);
  });

  it('同じ深さの兄弟は親が同じなら同じ結果になる', () => {
    const w = makeWorld(10);
    const parent = makeNode(w, 0, { x: 4, y: 1, rot: 0.3 });
    const a = makeNode(w, 1, { x: 1 });
    const b = makeNode(w, 1, { x: 1 });
    w.set(a, Parent.parent, parent);
    w.set(b, Parent.parent, parent);
    w.runPhase(Phase.PostUpdate, 1);
    expect(readWorld(w, a)).toEqual(readWorld(w, b));
  });

  it('再計算すると前フレームの値が混入しない (上書きされる)', () => {
    const w = makeWorld(10);
    const parent = makeNode(w, 0, { x: 2 });
    const child = makeNode(w, 1, { x: 1 });
    w.set(child, Parent.parent, parent);
    w.runPhase(Phase.PostUpdate, 1);
    const first = readWorld(w, child);
    w.set(parent, Transform.x, 100);
    w.runPhase(Phase.PostUpdate, 1);
    const second = readWorld(w, child);
    expect(first[4]).not.toBeCloseTo(second[4], 5);
    expect(second[4]).toBeCloseTo(101, 5);
  });

  it('composeHierarchicalWorlds は直接呼んでも同じ結果になる', () => {
    const w = makeWorld(10);
    w.setExecutor(new SerialScheduler());
    const parent = makeNode(w, 0, { x: 3, y: 1, rot: 0.4 });
    const child = makeNode(w, 1, { x: 2, y: -1, rot: 0.2 });
    w.set(child, Parent.parent, parent);
    // 深さ 0 だけを手動で計算してから階層を合成する
    w.runPhase(Phase.PostUpdate, 0);
    composeHierarchicalWorlds(w);
    const expected = affine2dMultiply(
      affine2dCreate(),
      referenceLocal(3, 1, 0.4, 1, 1),
      referenceLocal(2, -1, 0.2, 1, 1),
    );
    const got = readWorld(w, child);
    for (let i = 0; i < 6; i++) expect(got[i]).toBeCloseTo(expected[i], 5);
  });

  it('深さ MAX_HIERARCHY_DEPTH のノードは親の変換を取り込む (境界値)', () => {
    const w = makeWorld(10);
    const parent = makeNode(w, 0, { x: 1 });
    const child = makeNode(w, MAX_HIERARCHY_DEPTH, { x: 5 });
    w.set(child, Parent.parent, parent);
    w.runPhase(Phase.PostUpdate, 1);
    // 深さ 8 は走査範囲内なので tx = 親の 1 + ローカルの 5 = 6
    expect(readWorld(w, child)[4]).toBeCloseTo(6, 5);
  });

  it('深さ MAX_HIERARCHY_DEPTH 超過は保証外 (T-5.6 の ContainerHandle が PlutoError にする)', () => {
    // 走査は深さ 1〜MAX_HIERARCHY_DEPTH までなので、それより深いノードは親の変換を取り込まない。
    // docs/09 §container は「超過は PlutoError(InvalidArgument)」としており、
    // 階層を作れる API は T-5.6 の ContainerHandle なので、このタスクでは検出もしない。
    const w = makeWorld(10);
    const parent = makeNode(w, MAX_HIERARCHY_DEPTH, { x: 1 });
    const child = makeNode(w, MAX_HIERARCHY_DEPTH + 1, { x: 5 });
    w.set(child, Parent.parent, parent);
    w.runPhase(Phase.PostUpdate, 1);
    // 深さ 9 は走査範囲外なので、深さ 0 のカーネルの結果 (ローカルそのまま) のまま
    expect(readWorld(w, child)[4]).toBeCloseTo(5, 5);
  });

  it('degreesToRadians は度をラジアンに変換する', () => {
    expect(degreesToRadians(180)).toBeCloseTo(Math.PI, 6);
    expect(degreesToRadians(0)).toBe(0);
  });
});
