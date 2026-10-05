/**
 * @file メインスレッドと Worker 間で送受信されるメッセージの型定義とプロトコル
 */

export interface InitMessage {
  readonly type: 'init';
  readonly ctrlBuffer: SharedArrayBuffer;
  readonly countsBuffer: SharedArrayBuffer; // Uint32Array for archetype counts
}

export interface ArchetypeMessage {
  readonly type: 'archetype';
  readonly id: number;
  readonly entitiesBuffer: SharedArrayBuffer;
  /** fieldId -> Column BackingBuffer */
  readonly columns: Record<number, SharedArrayBuffer>;
}

export interface QueryMessage {
  readonly type: 'query';
  readonly queryId: number;
  /** このクエリにマッチするアーキタイプIDのリスト */
  readonly archetypeIds: number[];
}

export interface BufferMessage {
  readonly type: 'buffer';
  readonly kind: 'u32' | 'f32' | 'i32';
  readonly slot: number;
  readonly buffer: SharedArrayBuffer;
  readonly byteOffset: number;
  readonly length: number;
}

export interface ReadyMessage {
  readonly type: 'ready';
}

export type WorkerMessage = InitMessage | ArchetypeMessage | QueryMessage | BufferMessage;
export type MainMessage = ReadyMessage;
