/**
 * @file パリティテスト用のコンポーネントとカーネル定義 (docs/05-jobs-and-builds.md §2 のカーネル契約)。
 * view の範囲だけを読み書きし、params は常に 64 要素なので添字アクセスにガードは不要。
 */
import { defineComponent } from '../../../src/core/ecs';
import { ScalarType } from '../../../src/core/memory';
import { defineKernel } from '../../../src/jobs';
import type { ChunkView } from '../../../src/core/ecs';

/** カーネル 1 が読むコンポーネント (2 つの f32)。 */
export const ComponentA = defineComponent('ParityComponentA', {
  value1: ScalarType.F32,
  value2: ScalarType.F32,
});

/** カーネル 1 が書き、カーネル 2 が読むコンポーネント (結果とチャンク番号)。 */
export const ComponentB = defineComponent('ParityComponentB', {
  result: ScalarType.F32,
  chunkId: ScalarType.U32,
});

/** カーネル 2 が書き込むコンポーネント (累積値)。 */
export const ComponentC = defineComponent('ParityComponentC', {
  accumulator: ScalarType.F32,
});

/**
 * カーネル 1 の本体。chunkIndex を記録するので、クエリ全体の通し番号が Serial と一致するか分かる。
 * @param chunk 対象チャンク
 * @param params カーネルパラメータ (params[0] が dt)
 */
function runKernel1(chunk: ChunkView, params: Float32Array): void {
  const dt = params[0];
  const chunkIndex = chunk.chunkIndex;
  const value1 = chunk.column(ComponentA.value1);
  const value2 = chunk.column(ComponentA.value2);
  const result = chunk.column(ComponentB.result);
  const chunkIds = chunk.column(ComponentB.chunkId);
  const start = chunk.start;
  const end = chunk.end;
  for (let i = start; i < end; i++) {
    result[i] = value1[i] + value2[i] * dt;
    chunkIds[i] = chunkIndex;
  }
}

/**
 * カーネル 2 の本体。直前のカーネルの結果を累積するので、ジョブ間の競合がないことを検証できる。
 * @param chunk 対象チャンク
 */
function runKernel2(chunk: ChunkView): void {
  const result = chunk.column(ComponentB.result);
  const accumulator = chunk.column(ComponentC.accumulator);
  const start = chunk.start;
  const end = chunk.end;
  for (let i = start; i < end; i++) {
    accumulator[i] += result[i];
  }
}

/** 例外を投げて、メインへのエラー伝播とハングしないことを検証するカーネル。 */
function runFailingKernel(): void {
  throw new Error('パリティテスト: Worker 内で意図的に例外を発生させました');
}

/** カーネル 1 の定義。 */
export const parityKernel1 = defineKernel('ParityKernel1', runKernel1);

/** カーネル 2 の定義。 */
export const parityKernel2 = defineKernel('ParityKernel2', runKernel2);

/** 必ず例外を投げるカーネルの定義。 */
export const failingKernel = defineKernel('ParityFailingKernel', runFailingKernel);
