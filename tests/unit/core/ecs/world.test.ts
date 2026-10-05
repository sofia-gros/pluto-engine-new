import { describe, expect, it } from 'vitest';
import { World } from '../../../../src/core/ecs/world';
import { defineComponent } from '../../../../src/core/ecs/component';
import type { Entity } from '../../../../src/core/ecs/entity';
import { defineSystem, Phase } from '../../../../src/core/ecs/system';
import { ScalarType } from '../../../../src/core/memory/scalar-type';


const Position = defineComponent('Position', { x: ScalarType.F32, y: ScalarType.F32 });
const Velocity = defineComponent('Velocity', { x: ScalarType.F32, y: ScalarType.F32 });

describe('World', () => {
  it('ignores operations on dead entities and missing components', () => {
    const w = new World();
    
    w.despawn(123 as Entity);
    w.addComponent(123 as Entity, Position);
    w.removeComponent(123 as Entity, Position);
    expect(w.hasComponent(123 as Entity, Position)).toBe(false);
    expect(() => w.get(123 as Entity, Position.x)).toThrow();
    expect(() => {
      w.set(123 as Entity, Position.x, 0);
    }).toThrow();
    const e = w.spawn(Position);
    w.addComponent(e, Position); // already has it
    w.removeComponent(e, Velocity); // does not have it
    w.runPhase(Phase.PreUpdate, 1.0); // no systems
    w.addSystem({ name: 'Empty', phase: Phase.PreUpdate });
    w.runPhase(Phase.PreUpdate, 1.0); // system without run
  });
  it('spawns and queries entities instantly (when not iterating)', () => {
    const world = new World();
    
    const e1 = world.spawn(Position);
    world.set(e1, Position.x, 10);

    const e2 = world.spawn(Position, Velocity);
    world.set(e2, Position.x, 20);

    const q = world.query({ all: [Position] });

    expect(q.count()).toBe(2);

    expect(world.get(e1, Position.x)).toBe(10);
    expect(world.get(e2, Position.x)).toBe(20);
  });

  it('runs systems in phases', () => {
    const world = new World();
    const e1 = world.spawn(Position, Velocity);
    world.set(e1, Position.x, 0);
    world.set(e1, Velocity.x, 5);

    const MoveSys = defineSystem({
      name: 'Move',
      phase: Phase.Update,
      run: (w, dt) => {
        // 通常は Query 経由でイテレーションするが、簡易的に
        const v = w.get(e1, Velocity.x);
        // system 内で set を呼ぶと deferred ではなく即時セットされる？
        // いいえ、World.set は即時。isIterating のチェックは set にはない（値更新のみのため）。
        // しかし構造変更は禁止。
        const currentX = w.get(e1, Position.x);
        w.set(e1, Position.x, currentX + v * dt);
      },
    });

    world.addSystem(MoveSys);

    world.runPhase(Phase.Update, 2.0); // dt=2.0

    expect(world.get(e1, Position.x)).toBe(10); // 0 + 5 * 2
  });

  it('defers structural changes during iterations via CommandBuffer', () => {
    const world = new World();
    
    const e1 = world.spawn(Position);

    world.isIterating = true;
    expect(() => {
      world.spawn(Position);
    }).toThrow();
    expect(() => {
      world.despawn(e1);
    }).toThrow(); // 即時APIは失敗する
    expect(() => {
      world.addComponent(e1, Velocity);
    }).toThrow();

    // 代わりに commands を使う
    world.commands.addComponent(e1, Velocity);
    world.commands.set(e1, Velocity.x, 99);

    const e2 = world.commands.spawn(Position);
    world.commands.set(e2, Position.x, 100);
    const e3 = world.commands.spawn(Position);
    world.commands.despawn(e3);
    world.commands.set(e3, Position.x, 999);
    world.commands.addComponent(e3, Velocity);
    world.commands.removeComponent(e3, Velocity);
    world.commands.set(e2, Velocity.x, 999);
    world.commands.removeComponent(e1, Position);
    const TestInt = defineComponent('TestInt', { i: ScalarType.I32 });
    world.commands.addComponent(e1, TestInt);
    world.commands.set(e1, TestInt.i, 42);

    // まだ反映されていない
    world.isIterating = false;
    expect(world.hasComponent(e1, Velocity)).toBe(false);
    expect(world.isAlive(e2)).toBe(false);

    world.flush();

    // 反映された
    expect(world.hasComponent(e1, Velocity)).toBe(true);
    expect(world.get(e1, Velocity.x)).toBeCloseTo(99);

    expect(world.isAlive(e2)).toBe(true);
    expect(world.get(e2, Position.x)).toBeCloseTo(100);
    expect(world.isAlive(e3)).toBe(false);
    expect(world.hasComponent(e1, Position)).toBe(false);
    expect(world.hasComponent(e1, TestInt)).toBe(true);
    expect(world.get(e1, TestInt.i)).toBe(42);
  });
});
