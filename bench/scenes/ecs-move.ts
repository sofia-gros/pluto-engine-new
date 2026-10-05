import type { BenchScene } from '../bench-types';
import { World } from '../../src/core/ecs/world';
import { defineComponent } from '../../src/core/ecs/component';
import { ScalarType } from '../../src/core/memory/scalar-type';

const Transform = defineComponent('Transform', {
  x: ScalarType.F32,
  y: ScalarType.F32,
});

const Velocity = defineComponent('Velocity', {
  dx: ScalarType.F32,
  dy: ScalarType.F32,
});

export const scene: BenchScene = {
  name: 'ecs-move',
  setup(_game: unknown, count: number): void {
    if (count === 0) count = 1_000_000;
    
    // @ts-ignore
    window.world = new World();
    // @ts-ignore
    const world = window.world as World;

    // 1. spawn benchmark
    const t0 = performance.now();
    for (let i = 0; i < count; i++) {
      world.spawn(Transform, Velocity);
    }
    const t1 = performance.now();
    const spawnMs = t1 - t0;
    console.log(`Spawn ${count} entities: ${spawnMs.toFixed(2)} ms`);

    // 2. get/set benchmark
    // Entity ID starts from 1 because 0 is NULL_ENTITY probably. But wait, `spawn` returns actual entity handles.
    // However, for testing get/set we can just query them or use known entity handles.
    // Entity ID is just `index | (generation << 22)`.
    const q = world.query({ all: [Transform, Velocity] });
    const entities: number[] = [];
    q.forEachChunk((view) => {
      for (let i = view.start; i < view.end; i++) {
        entities.push(view.entity(i));
      }
    });

    const t2 = performance.now();
    for (let i = 0; i < count; i++) {
      const e = entities[i] as number;
      world.set(e, Velocity.dx, 1.5);
      world.set(e, Velocity.dy, 2.0);
    }
    const t3 = performance.now();
    const setMs = t3 - t2;
    console.log(`Set ${count} * 2 fields: ${setMs.toFixed(2)} ms`);

    const t4 = performance.now();
    let sum = 0;
    for (let i = 0; i < count; i++) {
      const e = entities[i] as number;
      sum += world.get(e, Velocity.dx);
      sum += world.get(e, Velocity.dy);
    }
    const t5 = performance.now();
    const getMs = t5 - t4;
    console.log(`Get ${count} * 2 fields: ${getMs.toFixed(2)} ms (sum=${sum})`);
  },
  step(): void {
    // @ts-ignore
    const world = window.world as World;
    const q = world.query({ all: [Transform, Velocity] });

    q.forEachChunk((view) => {
      const tx = view.column(Transform.x);
      const ty = view.column(Transform.y);
      const vx = view.column(Velocity.dx);
      const vy = view.column(Velocity.dy);

      const start = view.start;
      const end = view.end;

      for (let i = start; i < end; i++) {
        tx[i] += vx[i];
        ty[i] += vy[i];
      }
      
      view.markDirty(Transform.x);
      view.markDirty(Transform.y);
    });
  },
};
