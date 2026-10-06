/**
 * @file jobs モジュールの公開窓口 (docs/05-jobs-and-builds.md §2: createScheduler と型、カーネル定義 API のみ)。
 * createScheduler は T-2.3 で追加する。runWorkerLoop は src/worker-main.ts 専用。
 */
export { defineKernel, KernelBufferSlot, MAX_KERNEL_PARAMS } from './kernel';
export type { KernelBuffers, KernelDef, KernelFn, KernelId } from './kernel';
export type { KernelBufferKind, Scheduler } from './scheduler';
export { runWorkerLoop } from './worker-entry';
export type { FromWorkerMessage, ToWorkerMessage, WorkerPort } from './worker-protocol';
export { createScheduler } from './create-scheduler';
