/**
 * @file システム定義 `defineSystem` と `Phase` 定数 (docs/04-memory-and-ecs.md §8, docs/01-architecture.md §4)。
 * core/ecs は jobs を import できないため、カーネル関連は構造的な最小インターフェースとして定義する。
 */
import { ErrorCode, PlutoError } from '../debug';
import type { AnyComponentDef } from './component';
import type { Query, QueryDesc } from './query';
import type { World } from './world';

/** フレーム内の実行フェーズ (値は実行順)。 */
export const Phase = {
  PreUpdate: 0,
  FixedUpdate: 1,
  Update: 2,
  PostUpdate: 3,
  PreRender: 4,
} as const;

/** {@link Phase} の値の型。 */
export type Phase = (typeof Phase)[keyof typeof Phase];

/** カーネルに渡すパラメータの最大要素数 (`params[0]` は dt)。jobs/kernel.ts から再公開する。 */
export const MAX_KERNEL_PARAMS = 64;

/** jobs の KernelDef が満たす最小形 (ecs は実行方法を知らない)。 */
export interface KernelRef {
  /** カーネル ID。 */
  readonly id: number;
  /** カーネル名。 */
  readonly name: string;
}

/** カーネルシステムの実行者。jobs の Scheduler がこれを満たす。 */
export interface KernelExecutor {
  /**
   * ワーカーへ World の共有メモリ情報を同期する。
   * @param world 対象の World
   */
  syncWorld(world: World): void;
  /**
   * クエリの全チャンクにカーネルを実行し、完了まで戻らない。
   * @param kernel カーネル
   * @param query 対象クエリ
   * @param params パラメータ (`params[0]` = dt)
   */
  runKernel(kernel: KernelRef, query: Query, params: Float32Array): void;
}

/** メインスレッドで動く自由処理。 */
export type SystemRunFn = (world: World, dt: number) => void;

/** システム記述子。`kernel` と `run` はどちらか一方だけを指定する。 */
export interface SystemDef {
  /** システム名 (デバッグ・計測用)。 */
  readonly name: string;
  /** 実行フェーズ。 */
  readonly phase: Phase;
  /** 対象クエリ。 */
  readonly query: QueryDesc;
  /** 書き込むコンポーネント (dirty 追跡と並列安全性の宣言)。 */
  readonly writes?: readonly AnyComponentDef[];
  /** 組込カーネル (チャンク並列)。 */
  readonly kernel?: KernelRef;
  /** メインスレッドで動く自由処理 (ユーザー定義システムはこちら)。 */
  readonly run?: SystemRunFn;
  /** カーネル用パラメータ (長さ ≤ MAX_KERNEL_PARAMS。`params[0]` は実行時に dt で上書き)。 */
  readonly params?: Float32Array;
  /** 同フェーズ内の実行順 (小さい順、同値は登録順)。既定 0。 */
  readonly order?: number;
}

/**
 * システム記述子を検証して返す。
 * @param def システム記述子
 * @returns 同じ記述子
 */
export function defineSystem(def: SystemDef): SystemDef {
  const hasKernel = def.kernel !== undefined;
  const hasRun = def.run !== undefined;
  if (hasKernel === hasRun) {
    throw new PlutoError(
      ErrorCode.InvalidArgument,
      `システム ${def.name}: kernel と run はどちらか一方だけを指定してください。`,
    );
  }
  if (
    def.params !== undefined &&
    (def.params.length < 1 || def.params.length > MAX_KERNEL_PARAMS)
  ) {
    throw new PlutoError(
      ErrorCode.InvalidArgument,
      `システム ${def.name}: params の長さは 1 以上 ${String(MAX_KERNEL_PARAMS)} 以下にしてください。`,
    );
  }
  if (!Object.values(Phase).includes(def.phase)) {
    throw new PlutoError(ErrorCode.InvalidArgument, `システム ${def.name}: phase が不正です。`);
  }
  return def;
}
