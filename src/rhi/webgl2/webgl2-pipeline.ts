/**
 * @file WebGL2 版のプログラム生成とリフレクション (docs/06-rhi.md §4・§4.1・§6・§7・§9、`docs/02` §12)。
 * GLSL を編んでプログラムを作り、uniform ブロックとサンプラの reflection を取る。
 * ブロックは宣言順に binding を振り、サンプラは位置を覚える。
 */
import { ErrorCode, PlutoError } from '../../core/debug';
import type { RhiRenderPipeline } from '../device';
import type { ShaderSource } from '../shader-source';
import type { RenderPipelineDesc } from '../types';
import { buildPipelineState, type WebGlPipelineState } from './webgl2-convert';
import { validateRenderPipelineDesc } from '../validate';
import type { RhiCapabilities } from '../capabilities';
import {
  combineLayoutSlots,
  type WebGlBindGroupLayout,
  type WebGlBindingSlot,
} from './webgl2-bind-group';

/** 頂点シェーダの種別。仕様固定値。 */
const GL_VERTEX_SHADER = 0x8b31;

/** フラグメントシェーダの種別。仕様固定値。 */
const GL_FRAGMENT_SHADER = 0x8b30;

/** コンパイル状態。仕様固定値。 */
const GL_COMPILE_STATUS = 0x8b81;

/** リンク状態。仕様固定値。 */
const GL_LINK_STATUS = 0x8b82;

/** 有効な uniform の個数。仕様固定値。 */
const GL_ACTIVE_UNIFORMS = 0x8b4c;

/** 有効な uniform ブロックの個数。仕様固定値。 */
const GL_ACTIVE_UNIFORM_BLOCKS = 0x8a36;

/** `sampler2D` の種別。仕様固定値。 */
const GL_SAMPLER_2D = 0x8b5e;

/** `sampler2DArray` の種別。仕様固定値。 */
const GL_SAMPLER_2D_ARRAY = 0x8dc1;

/** `usampler2D` の種別。仕様固定値。 */
const GL_UNSIGNED_INT_SAMPLER_2D = 0x8ddc;

/** パイプラインの生成に使う情報。引数を 6 個以下に保つために束ねる。 */
export interface WebGlPipelineInfo {
  /** 生成時のラベル。 */
  readonly label: string;
  /** テクスチャ系スロット順のサンプラ位置。 */
  readonly samplerLocations: readonly (WebGLUniformLocation | null)[];
  /** テクスチャ系スロット順のサンプラ種別。 */
  readonly samplerTypes: readonly number[];
  /** 全体番号の割り当て表。 */
  readonly slots: readonly (readonly WebGlBindingSlot[])[];
  /** 適用する固定機能の状態。 */
  readonly state: WebGlPipelineState;
}

/** WebGL2 版のレンダーパイプライン。 */
export class WebGlRenderPipeline implements RhiRenderPipeline {
  /** 生成時のラベル。省略時は空文字列。 */
  public readonly label: string;

  /** テクスチャ系スロット順のサンプラ位置。 */
  public readonly samplerLocations: readonly (WebGLUniformLocation | null)[];

  /** テクスチャ系スロット順のサンプラ種別。適用時の型検査に使う。 */
  public readonly samplerTypes: readonly number[];

  /** 全体番号の割り当て表。エンコーダが適用時に読む。 */
  public readonly slots: readonly (readonly WebGlBindingSlot[])[];

  /** ブレンドを使うか。 */
  public readonly blendEnabled: boolean;

  /** ブレンド係数。 */
  public readonly blendSrcRGB: number;

  /** ブレンド係数。 */
  public readonly blendDstRGB: number;

  /** ブレンド係数。 */
  public readonly blendSrcAlpha: number;

  /** ブレンド係数。 */
  public readonly blendDstAlpha: number;

  /** カリングを使うか。 */
  public readonly cullEnabled: boolean;

  /** 刈る面。 */
  public readonly cullFace: number;

  /** 深度試験を使うか。 */
  public readonly depthEnabled: boolean;

  /** 深度比較関数。 */
  public readonly depthFunc: number;

  /** 深度を書き込むか。 */
  public readonly depthWrite: boolean;

  /** 書き込む色要素。 */
  public readonly writeMask: readonly [boolean, boolean, boolean, boolean];

  private readonly gl: WebGL2RenderingContext;

  private readonly program: WebGLProgram;

  private destroyed = false;

  /**
   * パイプラインのラッパーを作る。生成は `WebGlDevice.createRenderPipeline` からだけ呼ぶ。
   * @param gl GL コンテキスト
   * @param program GL プログラム
   * @param info 生成時の情報
   */
  public constructor(gl: WebGL2RenderingContext, program: WebGLProgram, info: WebGlPipelineInfo) {
    this.gl = gl;
    this.program = program;
    this.label = info.label;
    this.samplerLocations = info.samplerLocations;
    this.samplerTypes = info.samplerTypes;
    this.slots = info.slots;
    this.blendEnabled = info.state.blendEnabled;
    this.blendSrcRGB = info.state.blendSrcRGB;
    this.blendDstRGB = info.state.blendDstRGB;
    this.blendSrcAlpha = info.state.blendSrcAlpha;
    this.blendDstAlpha = info.state.blendDstAlpha;
    this.cullEnabled = info.state.cullEnabled;
    this.cullFace = info.state.cullFace;
    this.depthEnabled = info.state.depthEnabled;
    this.depthFunc = info.state.depthFunc;
    this.depthWrite = info.state.depthWrite;
    this.writeMask = info.state.writeMask;
  }

  /**
   * GL プログラムを取り出す。`src/rhi/webgl2/` 内部専用。
   * @returns GL プログラム
   */
  public get gpu(): WebGLProgram {
    if (this.destroyed) {
      throw new PlutoError(
        ErrorCode.InvalidState,
        `破棄済みのパイプライン ${this.label} を使いました`,
      );
    }
    return this.program;
  }

  /** パイプラインを破棄する。2 回呼んでも安全。 */
  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.gl.deleteProgram(this.program);
  }
}

/**
 * `ShaderSource` から GLSL を取り出す。GLSL が無ければ例外を投げる。
 * WGSL しか無いシェーダは WebGL2 で使えない。
 * @param source シェーダソース
 * @param vertex 頂点側なら true
 * @returns GLSL の文字列
 */
export function requireGlsl(source: ShaderSource, vertex: boolean): string {
  const code = vertex ? source.glslVertex : source.glslFragment;
  if (code === undefined || code === '') {
    throw new PlutoError(
      ErrorCode.UnsupportedFeature,
      `シェーダ ${source.name} に GLSL がありません。この実装は GLSL しか受け付けません`,
    );
  }
  return code;
}

/**
 * GL オブジェクトの生成結果が `null` でないことを確かめる。
 * コンテキスト喪失時は生成が `null` を返すため。
 * @param value 生成結果
 * @param message 失敗時の文言
 * @returns 非 `null` の値
 */
function assertCreated<T>(value: T | null, message: string): T {
  if (value === null) {
    throw new PlutoError(ErrorCode.InvalidState, message);
  }
  return value;
}

/**
 * シェーダを1 個編む。失敗時は名前付きのログで例外を投げる。
 * @param gl GL コンテキスト
 * @param type 頂点かフラグメントかの種別
 * @param source シェーダソース
 * @param vertex 頂点側なら true
 * @returns 編めたシェーダ
 */
export function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: ShaderSource,
  vertex: boolean,
): WebGLShader {
  const code = requireGlsl(source, vertex);
  const handle = assertCreated(gl.createShader(type), `シェーダ ${source.name} を作れませんでした`);
  gl.shaderSource(handle, code);
  gl.compileShader(handle);
  const hasCompiled: boolean = gl.getShaderParameter(handle, GL_COMPILE_STATUS) === true;
  if (!hasCompiled) {
    const log = __DEBUG__ ? gl.getShaderInfoLog(handle) : null;
    gl.deleteShader(handle);
    throw new PlutoError(
      ErrorCode.ShaderCompileFailed,
      `シェーダ ${source.name} のコンパイルに失敗しました${log === null || log === '' ? '' : `: ${log}`}`,
    );
  }
  return handle;
}

/**
 * 頂点とフラグメントを結んでプログラムを作る。失敗時は名前付きで例外を投げる。
 * @param gl GL コンテキスト
 * @param name シェーダ名 (ログ用)
 * @param vertex 編めた頂点シェーダ
 * @param fragment 編めたフラグメントシェーダ
 * @returns 結べたプログラム
 */
export function linkProgram(
  gl: WebGL2RenderingContext,
  name: string,
  vertex: WebGLShader,
  fragment: WebGLShader,
): WebGLProgram {
  const program = assertCreated(gl.createProgram(), `シェーダ ${name} の入れ物を作れませんでした`);
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  const hasLinked: boolean = gl.getProgramParameter(program, GL_LINK_STATUS) === true;
  if (!hasLinked) {
    const log = __DEBUG__ ? gl.getProgramInfoLog(program) : null;
    gl.deleteProgram(program);
    throw new PlutoError(
      ErrorCode.ShaderCompileFailed,
      `シェーダ ${name} のリンクに失敗しました${log === null || log === '' ? '' : `: ${log}`}`,
    );
  }
  return program;
}

/** パイプライン生成時に決まる固定機能の状態。 */
/**
 * reflection の結果。サンプラ位置と種別はテクスチャ系スロット順に並ぶ。
 */
export interface WebGlReflection {
  /** サンプラ位置。 */
  readonly locations: (WebGLUniformLocation | null)[];
  /** サンプラ種別。 */
  readonly types: number[];
}
function isSamplerType(type: number): boolean {
  return (
    type === GL_SAMPLER_2D || type === GL_SAMPLER_2D_ARRAY || type === GL_UNSIGNED_INT_SAMPLER_2D
  );
}

/**
 * プログラムの reflection を取り、ブロック binding とサンプラ位置を決める。
 * ブロックは宣言順に 0 から binding を振る。サンプラは宣言順に位置を覚える。
 * 個数が割り当てと合わなければ例外を投げる (シェーダの著述ミスの早期検出)。
 * @param gl GL コンテキスト
 * @param program 結べたプログラム
 * @param bufferTotal UBO スロットの合計
 * @param textureTotal テクスチャ系スロットの合計
 * @returns サンプラ位置 (テクスチャ系スロット順)
 */
export function reflectProgram(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  bufferTotal: number,
  textureTotal: number,
): WebGlReflection {
  const blocks = gl.getProgramParameter(program, GL_ACTIVE_UNIFORM_BLOCKS) as number;
  if (blocks !== bufferTotal) {
    throw new PlutoError(
      ErrorCode.InvalidArgument,
      `uniform ブロックが ${String(blocks)} 個ですが割り当ては ${String(bufferTotal)} 個です。シェーダの宣言順とレイアウトが合っていません`,
    );
  }
  for (let i = 0; i < blocks; i++) gl.uniformBlockBinding(program, i, i);
  const count = gl.getProgramParameter(program, GL_ACTIVE_UNIFORMS) as number;
  const reflection: WebGlReflection = { locations: [], types: [] };
  for (let i = 0; i < count; i++) {
    const info = gl.getActiveUniform(program, i);
    if (info === null || !isSamplerType(info.type)) continue;
    reflection.locations.push(gl.getUniformLocation(program, info.name));
    reflection.types.push(info.type);
  }
  if (reflection.locations.length !== textureTotal) {
    throw new PlutoError(
      ErrorCode.InvalidArgument,
      `サンプラが ${String(reflection.locations.length)} 個ですが割り当ては ${String(textureTotal)} 個です。シェーダの宣言順とレイアウトが合っていません`,
    );
  }
  return reflection;
}

/**
 * レンダーパイプラインを作る。`WebGlDevice.createRenderPipeline` からだけ呼ぶ。
 * @param gl GL コンテキスト
 * @param desc RHI の記述子
 * @param caps デバイスの能力
 * @returns 作ったパイプライン
 */
export function buildRenderPipeline(
  gl: WebGL2RenderingContext,
  desc: RenderPipelineDesc,
  caps: RhiCapabilities,
): WebGlRenderPipeline {
  validateRenderPipelineDesc(desc, caps);
  const vertex = compileShader(gl, GL_VERTEX_SHADER, desc.vertexShader, true);
  let fragment: WebGLShader | undefined;
  try {
    fragment = compileShader(gl, GL_FRAGMENT_SHADER, desc.fragmentShader, false);
  } catch (e) {
    gl.deleteShader(vertex);
    throw e;
  }
  const program = linkProgram(gl, desc.vertexShader.name, vertex, fragment);
  const assigned = (desc.layouts as WebGlBindGroupLayout[]).map((l) => l.assigned);
  const table = combineLayoutSlots(assigned);
  const buffers = assigned.reduce((n, l): number => n + l.bufferCount, 0);
  const textures = assigned.reduce((n, l): number => n + l.unitCount, 0);
  const reflection = reflectProgram(gl, program, buffers, textures);
  return new WebGlRenderPipeline(gl, program, {
    label: desc.vertexShader.name,
    samplerLocations: reflection.locations,
    samplerTypes: reflection.types,
    slots: table,
    state: buildPipelineState(desc),
  });
}
