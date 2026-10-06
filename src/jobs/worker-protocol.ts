/**
 * @file メイン ⇔ Worker のメッセージ型 (docs/05-jobs-and-builds.md §3.3)。postMessage はコールドパスのみ。
 */
import type { ComponentLayout, SharedArchetypeDesc } from '../core/ecs';
import type { KernelBufferKind } from './scheduler';

/** 初期化 (メイン → Worker)。 */
export interface InitMessage {
  /** 種類。 */
  readonly type: 'init';
  /** 制御ブロック。 */
  readonly ctrlBuffer: SharedArrayBuffer;
  /** アーキタイプ行数表。 */
  readonly countsBuffer: SharedArrayBuffer;
  /** メインのコンポーネント表 (ID の整合用)。 */
  readonly componentLayout: ComponentLayout;
}

/** アーキタイプの共有記述 (メイン → Worker)。 */
export interface ArchetypeMessage {
  /** 種類。 */
  readonly type: 'archetype';
  /** このメッセージの同期バージョン。 */
  readonly syncVersion: number;
  /** 共有記述。 */
  readonly desc: SharedArchetypeDesc;
}

/** クエリの対象アーキタイプ (メイン → Worker)。 */
export interface QueryMessage {
  /** 種類。 */
  readonly type: 'query';
  /** このメッセージの同期バージョン。 */
  readonly syncVersion: number;
  /** メインのクエリ ID。 */
  readonly queryId: number;
  /** 対象アーキタイプ ID (メインの登録順)。 */
  readonly archetypeIds: readonly number[];
}

/** 共有バッファ (メイン → Worker)。 */
export interface BufferMessage {
  /** 種類。 */
  readonly type: 'buffer';
  /** このメッセージの同期バージョン。 */
  readonly syncVersion: number;
  /** バッファの種類。 */
  readonly kind: KernelBufferKind;
  /** スロット番号。 */
  readonly slot: number;
  /** 共有バッファ。 */
  readonly buffer: SharedArrayBuffer;
  /** バイトオフセット。 */
  readonly byteOffset: number;
  /** 要素数。 */
  readonly length: number;
}

/** 初期化完了 (Worker → メイン、情報のみ)。 */
export interface ReadyMessage {
  /** 種類。 */
  readonly type: 'ready';
}

/** 例外の通知 (Worker → メイン)。 */
export interface ErrorMessage {
  /** 種類。 */
  readonly type: 'error';
  /** 内容。 */
  readonly message: string;
}

/** メイン → Worker のメッセージ。 */
export type ToWorkerMessage = InitMessage | ArchetypeMessage | QueryMessage | BufferMessage;
/** Worker → メインのメッセージ。 */
export type FromWorkerMessage = ReadyMessage | ErrorMessage;

/** runWorkerLoop が使う Worker スコープの最小形 (テストで差し替えられるようにする)。 */
export interface WorkerPort {
  /**
   * メインへ送る。
   * @param message メッセージ
   */
  post(message: FromWorkerMessage): void;
  /**
   * メインからのメッセージを受け取る関数を登録する。
   * @param handler 受信関数
   */
  listen(handler: (message: ToWorkerMessage) => void): void;
  /** Worker を閉じる。 */
  close(): void;
}
