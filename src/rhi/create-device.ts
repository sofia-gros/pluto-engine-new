/**
 * @file デバイス生成 (docs/06-rhi.md §2、`docs/02` §12)。
 * WebGPU → WebGL2 の順でデバイス生成を試みる唯一の場所。
 */
import { ErrorCode, PlutoError, logger } from '../core/debug';
import type { RhiDevice } from './device';
import { WebGlDevice } from './webgl2/webgl2-device';
import { EXT } from './webgl2/webgl2-convert';
import { WebGpuDevice } from './webgpu/webgpu-device';

/** デバイス生成のオプション (docs/06-rhi.md §2)。 */
export interface CreateDeviceOptions {
  /** 描画先のキャンバス。 */
  canvas: HTMLCanvasElement | OffscreenCanvas;
  /** 使用するバックエンド。省略時は 'auto'。 */
  backend?: 'auto' | 'webgpu' | 'webgl2';
  /** 電源の優先設定。省略時は 'high-performance'。 */
  powerPreference?: 'high-performance' | 'low-power';
  /** アンチエイリアスを有効にするか。省略時は false。 */
  antialias?: boolean;
}

/**
 * デバイス生成オプションを検証する。
 * @param opts 生成オプション
 */
/**
 * デバイス生成オプションを検証する。
 * @param opts 生成オプション
 */
function validateCreateDeviceOptions(opts: unknown): asserts opts is CreateDeviceOptions {
  if (typeof opts !== 'object' || opts === null) {
    throw new PlutoError(ErrorCode.InvalidArgument, 'options はオブジェクトでなければなりません');
  }
  const record = opts as Record<string, unknown>;
  if (!('canvas' in record) || record['canvas'] === undefined || record['canvas'] === null) {
    throw new PlutoError(ErrorCode.InvalidArgument, 'canvas は必須です');
  }

  const rawBackend = record['backend'];
  const isBackendValid =
    rawBackend === undefined ||
    rawBackend === 'auto' ||
    rawBackend === 'webgpu' ||
    rawBackend === 'webgl2';
  if (!isBackendValid) {
    const backendStr = typeof rawBackend === 'string' ? rawBackend : 'invalid';
    throw new PlutoError(ErrorCode.InvalidArgument, `不正な backend です: ${backendStr}`);
  }

  const rawPower = record['powerPreference'];
  const isPowerValid =
    rawPower === undefined || rawPower === 'high-performance' || rawPower === 'low-power';
  if (!isPowerValid) {
    const powerStr = typeof rawPower === 'string' ? rawPower : 'invalid';
    throw new PlutoError(ErrorCode.InvalidArgument, `不正な powerPreference です: ${powerStr}`);
  }
}

/**
 * WebGPU デバイスの生成を試みる。
 * @param canvas キャンバス
 * @param powerPreference 電源設定
 * @returns 生成された RhiDevice
 */
async function tryCreateWebGpu(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  powerPreference: 'high-performance' | 'low-power',
): Promise<RhiDevice> {
  const hasGpu = typeof navigator !== 'undefined' && 'gpu' in navigator && Boolean(navigator.gpu);
  if (!hasGpu) {
    throw new Error('navigator.gpu が利用できません');
  }
  const adapter = await navigator.gpu.requestAdapter({ powerPreference });
  if (!adapter) {
    throw new Error('WebGPU アダプタを取得できませんでした');
  }

  const requiredFeatures: GPUFeatureName[] = [];
  const candidateFeatures: readonly GPUFeatureName[] = [
    'timestamp-query',
    'indirect-first-instance',
    'texture-compression-bc',
    'texture-compression-etc2',
    'texture-compression-astc',
    'float32-blendable',
  ];
  for (const feat of candidateFeatures) {
    if (adapter.features.has(feat)) {
      requiredFeatures.push(feat);
    }
  }

  const requiredLimits: Record<string, number> = {};
  if (typeof adapter.limits.maxStorageBufferBindingSize === 'number') {
    requiredLimits['maxStorageBufferBindingSize'] = adapter.limits.maxStorageBufferBindingSize;
  }
  if (typeof adapter.limits.maxBufferSize === 'number') {
    requiredLimits['maxBufferSize'] = adapter.limits.maxBufferSize;
  }

  const device = await adapter.requestDevice({
    requiredFeatures,
    requiredLimits,
  });

  const context = canvas.getContext('webgpu');
  if (!isGpuCanvasContext(context)) {
    throw new Error('canvas から webgpu コンテキストを取得できませんでした');
  }

  return new WebGpuDevice({
    device,
    context,
    canvas,
  });
}

/**
 * オブジェクトが GPUCanvasContext かどうか判定する。
 * @param ctx 判定対象
 * @returns GPUCanvasContext なら true
 */
function isGpuCanvasContext(ctx: unknown): ctx is GPUCanvasContext {
  return typeof GPUCanvasContext !== 'undefined' && ctx instanceof GPUCanvasContext;
}

/**
 * オブジェクトが WebGL2RenderingContext かどうか判定する。
 * @param ctx 判定対象
 * @returns WebGL2RenderingContext なら true
 */
function isWebGl2Context(ctx: unknown): ctx is WebGL2RenderingContext {
  return typeof WebGL2RenderingContext !== 'undefined' && ctx instanceof WebGL2RenderingContext;
}

/**
 * WebGL2 デバイスの生成を試みる。
 * @param canvas キャンバス
 * @param powerPreference 電源設定
 * @param isAntialiasEnabled アンチエイリアス
 * @returns 生成された RhiDevice
 */
function tryCreateWebGl2(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  powerPreference: 'high-performance' | 'low-power',
  isAntialiasEnabled: boolean,
): RhiDevice {
  const gl = canvas.getContext('webgl2', {
    antialias: isAntialiasEnabled,
    alpha: false,
    depth: true,
    stencil: false,
    powerPreference,
    preserveDrawingBuffer: false,
  });

  if (!isWebGl2Context(gl)) {
    throw new Error('canvas から webgl2 コンテキストを取得できませんでした');
  }

  // 必須拡張 EXT_color_buffer_float の確認
  if (gl.getExtension(EXT.COLOR_BUFFER_FLOAT) === null) {
    throw new Error(`必須拡張 ${EXT.COLOR_BUFFER_FLOAT} が利用できません`);
  }

  // 任意拡張の有効化試行 (docs/06 §2)
  gl.getExtension(EXT.FLOAT_BLEND);
  gl.getExtension(EXT.BC7);
  gl.getExtension(EXT.ETC2);
  gl.getExtension(EXT.ASTC);
  gl.getExtension(EXT.TIMER_QUERY);

  return new WebGlDevice({ gl, canvas });
}

/**
 * RHI デバイスを生成する (docs/06-rhi.md §2)。
 * auto の場合は WebGPU を優先し、失敗時は WebGL2 にフォールバックする。
 * @param opts 生成オプション
 * @returns 生成された RhiDevice
 */
export async function createDevice(opts: CreateDeviceOptions): Promise<RhiDevice> {
  validateCreateDeviceOptions(opts);

  const backend = opts.backend ?? 'auto';
  const powerPreference = opts.powerPreference ?? 'high-performance';
  const isAntialiasEnabled = opts.antialias ?? false;

  if (backend === 'webgpu') {
    try {
      return await tryCreateWebGpu(opts.canvas, powerPreference);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.info(`WebGPU デバイス生成に失敗しました: ${msg}`);
      throw new PlutoError(ErrorCode.GpuUnavailable, `WebGPU デバイスを利用できません: ${msg}`);
    }
  }

  if (backend === 'webgl2') {
    try {
      return tryCreateWebGl2(opts.canvas, powerPreference, isAntialiasEnabled);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.info(`WebGL2 デバイス生成に失敗しました: ${msg}`);
      throw new PlutoError(ErrorCode.GpuUnavailable, `WebGL2 デバイスを利用できません: ${msg}`);
    }
  }

  // 'auto': WebGPU を試み、失敗したら WebGL2 にフォールバック
  try {
    return await tryCreateWebGpu(opts.canvas, powerPreference);
  } catch (gpuErr) {
    const gpuMsg = gpuErr instanceof Error ? gpuErr.message : String(gpuErr);
    logger.info(`WebGPU の試行に失敗しました (WebGL2 へフォールバックします): ${gpuMsg}`);
  }

  try {
    return tryCreateWebGl2(opts.canvas, powerPreference, isAntialiasEnabled);
  } catch (glErr) {
    const glMsg = glErr instanceof Error ? glErr.message : String(glErr);
    logger.info(`WebGL2 の試行に失敗しました: ${glMsg}`);
    throw new PlutoError(
      ErrorCode.GpuUnavailable,
      `WebGPU と WebGL2 の両方のデバイス生成に失敗しました: ${glMsg}`,
    );
  }
}
