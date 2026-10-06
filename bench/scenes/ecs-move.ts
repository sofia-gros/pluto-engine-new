/**
 * @file ECS ベンチ (docs/04-memory-and-ecs.md §10)。
 * 単発処理 (spawnN 一括・spawn 連鎖・set・get) は metrics に、
 * 移動カーネル 1 回の時間は毎フレーム sample に記録する。
 */
import type { BenchContext, BenchScene } from '../bench-types';
import { Phase, World, defineComponent, makeEntity } from '../../src/core/ecs';
import type { Entity } from '../../src/core/ecs';
import { ScalarType } from '../../src/core/memory';
import { defineKernel } from '../../src/jobs';
import { SerialScheduler } from '../../src/jobs/serial-scheduler';

const Position = defineComponent('BenchPosition', { x: ScalarType.F32, y: ScalarType.F32 });
const Velocity = defineComponent('BenchVelocity', { dx: ScalarType.F32, dy: ScalarType.F32 });

/** 移動カーネル (x += dx * dt)。 */
const MoveKernel = defineKernel('BenchMove', (view, params) => {
  const x = view.column(Position.x);
  const y = view.column(Position.y);
  const dx = view.column(Velocity.dx);
  const dy = view.column(Velocity.dy);
  const dt = params[0];
  const end = view.end;
  for (let i = view.start; i < end; i++) {
    x[i] += dx[i] * dt;
    y[i] += dy[i] * dt;
  }
  view.markDirty(Position.x);
  view.markDirty(Position.y);
});

let world: World | null = null;
let benchCtx: BenchContext | null = null;

/** ECS ベンチ (既定 100 万エンティティ)。 */
export const scene: BenchScene = {
  name: 'ecs-move',
  defaultCount: 1_000_000,
  setup(ctx: BenchContext, count: number): void {
    benchCtx = ctx;
    const w = new World({ maxEntities: Math.max(count, 1) });
    world = w;
    // 1. 一括生成 (行をまとめて確保する経路)
    const t0 = ctx.now();
    w.spawnN(count, [Position, Velocity]);
    ctx.metrics['spawnNMs'] = ctx.now() - t0;
    // set・get に使うエンティティは採番順に 0 から (bulk と連鎖は別の World を使う)
    const entities: Entity[] = new Array<Entity>(count);
    for (let i = 0; i < count; i++) entities[i] = makeEntity(i, 0);
    // 2. 1 体ずつの連鎖 (行ごとに dirty を立てる経路。bulk との比較用)
    const chainWorld = new World({ maxEntities: Math.max(count, 1) });
    const t1 = ctx.now();
    for (let i = 0; i < count; i++) chainWorld.spawn(Position, Velocity);
    ctx.metrics['spawnChainMs'] = ctx.now() - t1;
    // 3. world.set を count 回
    const t2 = ctx.now();
    for (let i = 0; i < count; i++) w.set(entities[i], Velocity.dx, 1.5);
    ctx.metrics['setMs'] = ctx.now() - t2;
    // 4. world.get を count 回
    const t3 = ctx.now();
    let sum = 0;
    for (let i = 0; i < count; i++) sum += w.get(entities[i], Velocity.dx);
    ctx.metrics['getMs'] = ctx.now() - t3;
    ctx.metrics['checksum'] = sum; // 計算が最適化で消されないように結果を残す (時間ではないので比較対象外)
    w.setExecutor(new SerialScheduler());
    w.addSystem({
      name: 'move',
      phase: Phase.Update,
      query: { all: [Position, Velocity] },
      kernel: MoveKernel,
    });
    benchCtx.metrics['count'] = count;
  },
  step(): void {
    if (world === null || benchCtx === null) return;
    const t = benchCtx.now();
    world.runPhase(Phase.Update, 1 / 144);
    benchCtx.sample('moveKernel', benchCtx.now() - t);
  },
};
