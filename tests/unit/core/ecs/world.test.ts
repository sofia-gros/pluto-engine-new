import { describe, expect, it } from 'vitest';
import { DEFAULT_MAX_ENTITIES, World } from '../../../../src/core/ecs/world';
import { defineComponent } from '../../../../src/core/ecs/component';
import { MAX_ENTITIES, makeEntity } from '../../../../src/core/ecs/entity';
import type { Entity } from '../../../../src/core/ecs/entity';
import { Phase } from '../../../../src/core/ecs/system';
import type { KernelExecutor, KernelRef } from '../../../../src/core/ecs/system';
import type { Query } from '../../../../src/core/ecs/query';
import { ScalarType } from '../../../../src/core/memory/scalar-type';
import { ErrorCode, PlutoError } from '../../../../src/core/debug/pluto-error';

const Position = defineComponent('Position', { x: ScalarType.F32, y: ScalarType.F32 });
const Velocity = defineComponent('Velocity', { x: ScalarType.F32 });
const Count = defineComponent('Count', { n: ScalarType.U32 });

/** 呼び出しを記録するだけの実行者 (カーネルは jobs が実行するので、ここでは境界としてモックする)。 */
class RecordingExecutor implements KernelExecutor {
  public syncCount = 0;
  public readonly runs: { kernel: string; query: Query; dt: number }[] = [];
  public syncWorld(): void {
    this.syncCount++;
  }
  public runKernel(kernel: KernelRef, query: Query, params: Float32Array): void {
    this.runs.push({ kernel: kernel.name, query, dt: params[0] });
  }
}

describe('World', () => {
  it('既定の maxEntities は 1,048,576。上限 (MAX_ENTITIES) 超・0 は PlutoError(InvalidArgument)', () => {
    expect(DEFAULT_MAX_ENTITIES).toBe(1_048_576);
    expect(() => new World({ maxEntities: MAX_ENTITIES + 1 })).toThrow(
      expect.objectContaining({ code: ErrorCode.InvalidArgument }),
    );
    expect(() => new World({ maxEntities: 0 })).toThrow(PlutoError);
  });

  it('spawn / get / set / hasComponent / isAlive', () => {
    const w = new World({ maxEntities: 100 });
    const e = w.spawn(Position, Velocity);
    w.set(e, Position.x, 10);
    expect(w.get(e, Position.x)).toBe(10);
    expect(w.isAlive(e)).toBe(true);
    expect(w.hasComponent(e, Velocity)).toBe(true);
    expect(w.hasComponent(e, Count)).toBe(false);
  });

  it('回帰: クエリ作成後に 1,000 体 spawn しても件数とチャンク数が正しい (重複登録しない)', () => {
    const w = new World({ maxEntities: 2000 });
    const q = w.query({ all: [Position] });
    for (let i = 0; i < 1000; i++) w.spawn(Position);
    expect(q.archetypes).toHaveLength(1);
    expect(q.count()).toBe(1000);
    expect(q.chunkCount()).toBe(1);
  });

  it('回帰: 最初の個体 makeEntity(0, 0) が swap-remove で移動しても正しい行を読む', () => {
    const w = new World({ maxEntities: 10 });
    const first = w.spawn(Count);
    expect(first).toBe(makeEntity(0, 0));
    const second = w.spawn(Count);
    const third = w.spawn(Count);
    w.set(first, Count.n, 111);
    w.set(third, Count.n, 333);
    w.despawn(second); // first は動かない
    w.despawn(first); // third が row 0 へ
    expect(w.get(third, Count.n)).toBe(333);
    const fourth = w.spawn(Count);
    w.set(fourth, Count.n, 444);
    w.despawn(third); // fourth (末尾) が row 0 へ
    expect(w.get(fourth, Count.n)).toBe(444);
  });

  it('add / remove でアーキタイプを移り、値を保つ。持っていれば・死んでいれば何もしない', () => {
    const w = new World({ maxEntities: 10 });
    const e = w.spawn(Position);
    w.set(e, Position.y, 5);
    w.addComponent(e, Velocity);
    w.addComponent(e, Velocity);
    expect(w.get(e, Position.y)).toBe(5);
    w.removeComponent(e, Position);
    w.removeComponent(e, Position);
    expect(w.hasComponent(e, Position)).toBe(false);
    w.despawn(e);
    w.despawn(e);
    w.addComponent(e, Position);
    expect(w.hasComponent(e, Position)).toBe(false);
  });

  it('生存していないエンティティの get / set は assert で失敗する', () => {
    const w = new World({ maxEntities: 10 });
    const dead = 123 as Entity;
    expect(() => w.get(dead, Position.x)).toThrow(PlutoError);
    expect(() => {
      w.set(dead, Position.x, 1);
    }).toThrow(PlutoError);
  });

  it('query は条件の順序によらず同じインスタンスを返し、新規作成で structureVersion が増える', () => {
    const w = new World({ maxEntities: 10 });
    const v0 = w.structureVersion;
    const q = w.query({ all: [Position, Velocity] });
    expect(w.query({ all: [Velocity, Position] })).toBe(q);
    expect(w.structureVersion).toBe(v0 + 1);
    w.spawn(Count); // 新しいアーキタイプ
    expect(w.structureVersion).toBe(v0 + 2);
    w.spawn(Count); // 既存アーキタイプ
    expect(w.structureVersion).toBe(v0 + 2);
    expect(w.queries).toContain(q);
  });

  it('アーキタイプのバッファが伸長されると structureVersion が進む (jobs が Worker に送り直す)', () => {
    const w = new World({ maxEntities: 5000 });
    w.spawn(Count);
    const v = w.structureVersion;
    for (let i = 1; i < 1024; i++) w.spawn(Count); // 初期容量 1024 行ちょうどまでは伸長しない
    expect(w.structureVersion).toBe(v);
    w.spawn(Count); // 1025 行目で伸長
    expect(w.structureVersion).toBe(v + 1);
  });

  it('run システムはフェーズ・order 順に実行され、実行中は isIterating が true', () => {
    const w = new World({ maxEntities: 10 });
    const log: string[] = [];
    w.addSystem({ name: 'b', phase: Phase.Update, query: {}, order: 1, run: () => log.push('b') });
    w.addSystem({
      name: 'a',
      phase: Phase.Update,
      query: {},
      run: (world, dt) => log.push(`a${String(dt)}:${String(world.isIterating)}`),
    });
    w.addSystem({ name: 'c', phase: Phase.PreUpdate, query: {}, run: () => log.push('c') });
    w.runPhase(Phase.Update, 2);
    expect(log).toEqual(['a2:true', 'b']);
    expect(w.isIterating).toBe(false);
  });

  it('システム実行中の即時構造変更は失敗し、例外後も isIterating が戻る', () => {
    const w = new World({ maxEntities: 10 });
    const e = w.spawn(Position);
    w.addSystem({
      name: 'bad',
      phase: Phase.Update,
      query: {},
      run: (world) => {
        world.spawn(Position);
      },
    });
    expect(() => {
      w.runPhase(Phase.Update, 1);
    }).toThrow(PlutoError);
    expect(w.isIterating).toBe(false);
    w.despawn(e);
    expect(w.isAlive(e)).toBe(false);
  });

  it('kernel システムは実行者に委譲され、params[0] に dt が入り、構造変化時だけ syncWorld が呼ばれる', () => {
    const w = new World({ maxEntities: 10 });
    const ex = new RecordingExecutor();
    w.setExecutor(ex);
    w.addSystem({
      name: 'move',
      phase: Phase.Update,
      query: { all: [Position] },
      kernel: { id: 7, name: 'Move' },
    });
    w.runPhase(Phase.Update, 0.5);
    w.runPhase(Phase.Update, 0.25);
    expect(ex.syncCount).toBe(1);
    w.spawn(Position); // 新しいアーキタイプ → 再同期が必要
    w.runPhase(Phase.Update, 0.125);
    expect(ex.syncCount).toBe(2);
    expect(ex.runs.map((r) => [r.kernel, r.dt])).toEqual([
      ['Move', 0.5],
      ['Move', 0.25],
      ['Move', 0.125],
    ]);
    expect(ex.runs[0].query).toBe(w.query({ all: [Position] }));
  });

  it('実行者が未設定で kernel システムを実行すると PlutoError(NotInitialized)', () => {
    const w = new World({ maxEntities: 10 });
    w.addSystem({ name: 'k', phase: Phase.Update, query: {}, kernel: { id: 1, name: 'K' } });
    expect(() => {
      w.runPhase(Phase.Update, 1);
    }).toThrow(expect.objectContaining({ code: ErrorCode.NotInitialized }));
  });

  it('commands の構造変更・値設定は flush まで反映されない', () => {
    const w = new World({ maxEntities: 20 });
    const e1 = w.spawn(Position);
    const Tag = defineComponent('TagI', { i: ScalarType.I32 });
    w.commands.addComponent(e1, Velocity);
    w.commands.set(e1, Velocity.x, 99);
    const e2 = w.commands.spawn1(Position);
    w.commands.set(e2, Position.x, 100);
    const e3 = w.commands.spawnN([Position]);
    w.commands.despawn(e3);
    w.commands.set(e3, Position.x, 999);
    w.commands.removeComponent(e1, Position);
    w.commands.addComponent(e1, Tag);
    w.commands.set(e1, Tag.i, -42);
    w.commands.set(e1, Position.x, 5); // Position は外れるので無視される
    expect(w.isAlive(e2)).toBe(false);
    w.flush();
    expect(w.get(e1, Velocity.x)).toBe(99);
    expect(w.get(e2, Position.x)).toBe(100);
    expect(w.isAlive(e3)).toBe(false);
    expect(w.hasComponent(e1, Position)).toBe(false);
    expect(w.get(e1, Tag.i)).toBe(-42);
    expect(w.commands.length).toBe(0);
  });

  it('flush で spawn した行も dirty になる (スプライトパックが拾える)', () => {
    const w = new World({ maxEntities: 10 });
    const q = w.query({ all: [Position] });
    w.commands.spawn1(Position);
    w.flush();
    const arch = q.archetypes[0];
    const ranges: number[][] = [];
    arch.changeTracker.forEachDirtyRange(Position.x.fieldId, arch.count, (s, e) =>
      ranges.push([s, e]),
    );
    expect(ranges).toEqual([[0, 1]]);
  });
});
