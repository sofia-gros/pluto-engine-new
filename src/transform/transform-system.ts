/**
 * @file 階層のワールド行列を `Phase.PostUpdate` で計算するシステム (`docs/02` §11)。
 * 深さ 0 (親なし) はカーネルに委譲して並列に計算し、深さ 1〜8 はメインスレッドで親を合成する。
 *
 * 深い階層をカーネルで処理しない理由: カーネルには自チャンクの `ChunkView` しか渡らない
 * (`docs/05` §2) ので、親が別のアーキタイプにあると参照できない。実際 `ContainerHandle` は
 * `Transform`/`Parent`/`HierarchyDepth`、`SpriteHandle` は `Transform`/`WorldTransform`/`Sprite`/`SpriteSlot`
 * を持ち、親子でアーキタイプが異なる。並列化が必要な 100 万スプライトは深さ 0 のケースである。
 *
 * 2 つのシステムに分ける理由: `defineSystem` は `kernel` と `run` のどちらか一方だけを
 * 許す (`docs/04` §8) ので、「深さ 0 をカーネルで + 深い階層を run で」は 1 つのシステムでは書けない。
 * `order` で深さ 0 のカーネルを先に走らせる。
 */
import { DEG_TO_RAD } from '../core/math';
import { Phase, defineSystem } from '../core/ecs';
import type { Entity, Query, World } from '../core/ecs';
import {
  HierarchyDepth,
  MAX_HIERARCHY_DEPTH,
  Parent,
  Transform,
  WorldTransform,
} from './transform-components';
import { RootWorldTransformKernel } from './transform-kernels';

/** 深さ順の走査で使い回す作業領域 (フレーム中に確保しない)。 */
const parentWorld = new Float32Array(6);
const localWorld = new Float32Array(6);
const composedWorld = new Float32Array(6);
const entityBuffer: Entity[] = [];

/** ローカル行列 (回転・スケール・平行移動) を 2x3 アフィンとして作る。 */
function composeLocal(
  out: Float32Array,
  x: number,
  y: number,
  rotation: number,
  scaleX: number,
  scaleY: number,
): Float32Array {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  out[0] = cos * scaleX;
  out[1] = sin * scaleX;
  out[2] = -sin * scaleY;
  out[3] = cos * scaleY;
  out[4] = x;
  out[5] = y;
  return out;
}

/**
 * 親の世界行列にローカルを合成する (`world = parentWorld * local`)。
 * `affine2d.multiply` と同じ式を使う (docs/05 §2 の参照実装と一致させるため)。
 */
function composeWorld(out: Float32Array, parent: Float32Array, local: Float32Array): Float32Array {
  const p0 = parent[0];
  const p1 = parent[1];
  const p2 = parent[2];
  const p3 = parent[3];
  const p4 = parent[4];
  const p5 = parent[5];
  const l0 = local[0];
  const l1 = local[1];
  const l2 = local[2];
  const l3 = local[3];
  const l4 = local[4];
  const l5 = local[5];
  out[0] = p0 * l0 + p2 * l1;
  out[1] = p1 * l0 + p3 * l1;
  out[2] = p0 * l2 + p2 * l3;
  out[3] = p1 * l2 + p3 * l3;
  out[4] = p0 * l4 + p2 * l5 + p4;
  out[5] = p1 * l4 + p3 * l5 + p5;
  return out;
}

/** 指定した深さを持つエンティティを `entityBuffer` に集める。 */
function collectByDepth(query: Query, depth: number): number {
  entityBuffer.length = 0;
  const archetypes = query.archetypes;
  const n = archetypes.length;
  for (let i = 0; i < n; i++) {
    const arch = archetypes[i];
    const count = arch.count;
    const depthColumn = arch.getColumn(HierarchyDepth.depth);
    for (let row = 0; row < count; row++) {
      if (depthColumn[row] !== depth) continue;
      entityBuffer.push(arch.entities[row] as Entity);
    }
  }
  return entityBuffer.length;
}

/**
 * 深さ 1〜`MAX_HIERARCHY_DEPTH` のエンティティのワールド行列を、メインスレッドで合成する。
 * 親のワールド行列が先に計算されている必要があるため、深さの小さい順に走査する。
 * @param world 対象の World
 */
export function composeHierarchicalWorlds(world: World): void {
  const fA = WorldTransform.a;
  const fB = WorldTransform.b;
  const fC = WorldTransform.c;
  const fD = WorldTransform.d;
  const fTx = WorldTransform.tx;
  const fTy = WorldTransform.ty;
  for (let depth = 1; depth <= MAX_HIERARCHY_DEPTH; depth++) {
    const query = world.query({ all: [Transform, Parent, HierarchyDepth, WorldTransform] });
    const count = collectByDepth(query, depth);
    for (let i = 0; i < count; i++) {
      const e = entityBuffer[i];
      const parent = world.get(e, Parent.parent) as Entity;
      parentWorld[0] = world.get(parent, fA);
      parentWorld[1] = world.get(parent, fB);
      parentWorld[2] = world.get(parent, fC);
      parentWorld[3] = world.get(parent, fD);
      parentWorld[4] = world.get(parent, fTx);
      parentWorld[5] = world.get(parent, fTy);
      composeLocal(
        localWorld,
        world.get(e, Transform.x),
        world.get(e, Transform.y),
        world.get(e, Transform.rotation),
        world.get(e, Transform.scaleX),
        world.get(e, Transform.scaleY),
      );
      composeWorld(composedWorld, parentWorld, localWorld);
      world.set(e, fA, composedWorld[0]);
      world.set(e, fB, composedWorld[1]);
      world.set(e, fC, composedWorld[2]);
      world.set(e, fD, composedWorld[3]);
      world.set(e, fTx, composedWorld[4]);
      world.set(e, fTy, composedWorld[5]);
    }
  }
}

/**
 * 深さ 0 (親なし) のワールド行列を並列に計算するカーネルシステム。
 * 階層を持つエンティティは `Transform`/`WorldTransform` を持つが親があるので、
 * このクエリに一致するものはすべて根として扱われる。
 */
export const TransformRootSystem = defineSystem({
  name: 'Transform.Root',
  phase: Phase.PostUpdate,
  query: { all: [Transform, WorldTransform] },
  kernel: RootWorldTransformKernel,
  order: 0,
});

/** 深さ 1〜8 のワールド行列を親と合成するシステム。深さ 0 の後に実行する。 */
export const TransformHierarchySystem = defineSystem({
  name: 'Transform.Hierarchy',
  phase: Phase.PostUpdate,
  query: { all: [Transform, Parent, HierarchyDepth, WorldTransform] },
  run: composeHierarchicalWorlds,
  order: 1,
});

/** 角度 (度) をラジアンに変換する補助 (上位 API の `angle` 用)。 */
export function degreesToRadians(degrees: number): number {
  return degrees * DEG_TO_RAD;
}
