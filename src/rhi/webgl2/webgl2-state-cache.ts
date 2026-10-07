// @pluto-hot
/**
 * @file GL 状態キャッシュ (docs/06-rhi.md §7、`docs/02` §12)。
 * `gl.enable` などを直接呼ばず、全てここ経由にする。同じ値は送らない。
 * 毎フレームの経路では `new` を使わない。
 */

/** GL の能力値。仕様固定値。 */
const GL_CAPS = {
  BLEND: 0x0be2,
  CULL_FACE: 0x0b44,
  DEPTH_TEST: 0x0b71,
  SCISSOR_TEST: 0x0c11,
} as const;

/** その他の GL 定数。仕様固定値。 */
const GL_TEXTURE0 = 0x84c0;
const GL_TEXTURE_2D = 0x0de1;
const GL_UNIFORM_BUFFER = 0x8a11;
const GL_FUNC_ADD = 0x8006;

/** テクスチャユニットの最大数。 */
const MAX_TEXTURE_UNITS = 8;

/** バインドグループレイアウトの最大数 (docs/06 §5.1.1)。 */
const MAX_BINDINGS = 4;

/** GL 状態キャッシュ。コンストラクタで器の確保を済ませる。 */
export class WebGlStateCache {
  private readonly gl: WebGL2RenderingContext;

  private viewportX = -1;

  private viewportY = -1;

  private viewportW = -1;

  private viewportH = -1;

  private scissorX = -1;

  private scissorY = -1;

  private scissorW = -1;

  private scissorH = -1;

  private scissorEnabled = false;

  private blendEnabled = false;

  private blendSrcRGB = -1;

  private blendDstRGB = -1;

  private blendSrcAlpha = -1;

  private blendDstAlpha = -1;

  private cullEnabled = false;

  private cullFace = -1;

  private depthEnabled = false;

  private depthFunc = -1;

  private depthWrite = false;

  private colorR = false;

  private colorG = false;

  private colorB = false;

  private colorA = false;

  private clearR = -1;

  private clearG = -1;

  private clearB = -1;

  private clearA = -1;

  private clearDepthValue = -1;

  private readonly unitTargets: number[] = [];

  private readonly unitTextures: (WebGLTexture | null)[] = [];

  private activeUnit = -1;

  private readonly boundBuffers: (WebGLBuffer | null)[] = [];

  private readonly boundOffsets: number[] = [];

  private readonly boundSizes: number[] = [];

  private program: WebGLProgram | null = null;

  private programSet = false;

  private readonly boundSamplers: (WebGLSampler | null)[] = [];

  private unpackAlignment = -1;

  private framebuffer: WebGLFramebuffer | null = null;

  private framebufferSet = false;

  /**
   * キャッシュを作る。GL の現在値は読まず、全て未設定として始める。
   * @param gl GL コンテキスト
   */
  public constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    for (let i = 0; i < MAX_TEXTURE_UNITS; i++) {
      this.unitTargets.push(-1);
      this.unitTextures.push(null);
    }
    for (let i = 0; i < MAX_BINDINGS; i++) {
      this.boundBuffers.push(null);
      this.boundOffsets.push(-1);
      this.boundSizes.push(-1);
    }
  }

  /**
   * 全て未設定に戻す。コンテキスト喪失の復帰時などに呼ぶ。
   * @hot
   */
  public reset(): void {
    this.viewportW = -1;
    this.scissorW = -1;
    this.scissorEnabled = false;
    this.blendEnabled = false;
    this.blendSrcRGB = -1;
    this.cullEnabled = false;
    this.cullFace = -1;
    this.depthEnabled = false;
    this.depthFunc = -1;
    this.depthWrite = false;
    this.colorR = false;
    this.colorG = false;
    this.colorB = false;
    this.colorA = false;
    this.clearR = -1;
    this.clearDepthValue = -1;
    this.activeUnit = -1;
    for (let i = 0; i < MAX_TEXTURE_UNITS; i++) {
      this.unitTargets[i] = -1;
      this.unitTextures[i] = null;
      this.boundSamplers[i] = null;
    }
    for (let i = 0; i < MAX_BINDINGS; i++) {
      this.boundBuffers[i] = null;
      this.boundOffsets[i] = -1;
    }
    this.programSet = false;
    this.framebufferSet = false;
    for (let i = 0; i < MAX_TEXTURE_UNITS; i++) this.boundSamplers[i] = null;
    this.unpackAlignment = -1;
  }

  /** ビューポートを設定する。 @hot */
  public setViewport(x: number, y: number, w: number, h: number): void {
    if (
      this.viewportX === x &&
      this.viewportY === y &&
      this.viewportW === w &&
      this.viewportH === h
    ) {
      return;
    }
    this.viewportX = x;
    this.viewportY = y;
    this.viewportW = w;
    this.viewportH = h;
    this.gl.viewport(x, y, w, h);
  }

  /** はさみ倍の矩形を設定する。初回は試験も有効にする。 @hot */
  public setScissor(x: number, y: number, w: number, h: number): void {
    if (!this.scissorEnabled) {
      this.scissorEnabled = true;
      this.gl.enable(GL_CAPS.SCISSOR_TEST);
    }
    if (this.scissorX === x && this.scissorY === y && this.scissorW === w && this.scissorH === h) {
      return;
    }
    this.scissorX = x;
    this.scissorY = y;
    this.scissorW = w;
    this.scissorH = h;
    this.gl.scissor(x, y, w, h);
  }

  /** ブレンドを設定する。 @hot */
  public setBlend(
    enable: boolean,
    srcRGB: number,
    dstRGB: number,
    srcAlpha: number,
    dstAlpha: number,
  ): void {
    if (this.blendEnabled !== enable) {
      this.blendEnabled = enable;
      if (enable) this.gl.enable(GL_CAPS.BLEND);
      else this.gl.disable(GL_CAPS.BLEND);
    }
    if (
      this.blendSrcRGB === srcRGB &&
      this.blendDstRGB === dstRGB &&
      this.blendSrcAlpha === srcAlpha &&
      this.blendDstAlpha === dstAlpha
    ) {
      return;
    }
    this.blendSrcRGB = srcRGB;
    this.blendDstRGB = dstRGB;
    this.blendSrcAlpha = srcAlpha;
    this.blendDstAlpha = dstAlpha;
    this.gl.blendFuncSeparate(srcRGB, dstRGB, srcAlpha, dstAlpha);
    this.gl.blendEquation(GL_FUNC_ADD);
  }

  /** カリングを設定する。 @hot */
  public setCull(enable: boolean, face: number): void {
    if (this.cullEnabled !== enable) {
      this.cullEnabled = enable;
      if (enable) this.gl.enable(GL_CAPS.CULL_FACE);
      else this.gl.disable(GL_CAPS.CULL_FACE);
    }
    if (!enable || this.cullFace === face) return;
    this.cullFace = face;
    this.gl.cullFace(face);
  }

  /** 深度試験を設定する。 @hot */
  public setDepth(enable: boolean, func: number, write: boolean): void {
    if (this.depthEnabled !== enable) {
      this.depthEnabled = enable;
      if (enable) this.gl.enable(GL_CAPS.DEPTH_TEST);
      else this.gl.disable(GL_CAPS.DEPTH_TEST);
    }
    if (enable && this.depthFunc !== func) {
      this.depthFunc = func;
      this.gl.depthFunc(func);
    }
    if (this.depthWrite !== write) {
      this.depthWrite = write;
      this.gl.depthMask(write);
    }
  }

  /** 書き込む色要素を設定する。 @hot */
  public setColorMask(r: boolean, g: boolean, b: boolean, a: boolean): void {
    if (this.colorR === r && this.colorG === g && this.colorB === b && this.colorA === a) return;
    this.colorR = r;
    this.colorG = g;
    this.colorB = b;
    this.colorA = a;
    this.gl.colorMask(r, g, b, a);
  }

  /** 消去色を設定する。 @hot */
  public setClearColor(r: number, g: number, b: number, a: number): void {
    if (this.clearR === r && this.clearG === g && this.clearB === b && this.clearA === a) return;
    this.clearR = r;
    this.clearG = g;
    this.clearB = b;
    this.clearA = a;
    this.gl.clearColor(r, g, b, a);
  }

  /** 消去深度を設定する。 @hot */
  public setClearDepth(depth: number): void {
    if (this.clearDepthValue === depth) return;
    this.clearDepthValue = depth;
    this.gl.clearDepth(depth);
  }

  /** 消去する。 @hot */
  public clear(doColor: boolean, doDepth: boolean): void {
    let mask = 0;
    if (doColor) mask |= 0x4000;
    if (doDepth) mask |= 0x0100;
    if (mask !== 0) this.gl.clear(mask);
  }

  /** 2D テクスチャを単位に結び付ける。 @hot */
  public bindTexture2D(unit: number, texture: WebGLTexture | null): void {
    if (this.unitTextures[unit] === texture && this.unitTargets[unit] === GL_TEXTURE_2D) return;
    if (this.activeUnit !== unit) {
      this.activeUnit = unit;
      this.gl.activeTexture(GL_TEXTURE0 + unit);
    }
    this.unitTargets[unit] = GL_TEXTURE_2D;
    this.unitTextures[unit] = texture;
    this.gl.bindTexture(GL_TEXTURE_2D, texture);
  }

  /** UBO の範囲を binding に結び付ける。 @hot */
  public bindUniformRange(
    binding: number,
    buffer: WebGLBuffer | null,
    offset: number,
    size: number,
  ): void {
    if (
      this.boundBuffers[binding] === buffer &&
      this.boundOffsets[binding] === offset &&
      this.boundSizes[binding] === size
    ) {
      return;
    }
    this.boundBuffers[binding] = buffer;
    this.boundOffsets[binding] = offset;
    this.boundSizes[binding] = size;
    this.gl.bindBufferRange(GL_UNIFORM_BUFFER, binding, buffer, offset, size);
  }

  /** サンプラを単位に結び付ける。 @hot */
  public bindSampler(unit: number, sampler: WebGLSampler | null): void {
    if (this.boundSamplers[unit] === sampler) return;
    if (this.activeUnit !== unit) {
      this.activeUnit = unit;
      this.gl.activeTexture(GL_TEXTURE0 + unit);
    }
    this.boundSamplers[unit] = sampler;
    this.gl.bindSampler(unit, sampler);
  }

  /** 転送の行揃えを設定する。 @hot */
  public setUnpackAlignment(alignment: number): void {
    if (this.unpackAlignment === alignment) return;
    this.unpackAlignment = alignment;
    this.gl.pixelStorei(0x0cf5, alignment);
  }

  /** プログラムを使う。 @hot */
  public useProgram(program: WebGLProgram | null): void {
    if (this.programSet && this.program === program) return;
    this.programSet = true;
    this.program = program;
    this.gl.useProgram(program);
  }

  /** 描画先を結び付ける。`null` は既定のフレームバッファ。 @hot */
  public bindFramebuffer(fb: WebGLFramebuffer | null): void {
    if (this.framebufferSet && this.framebuffer === fb) return;
    this.framebufferSet = true;
    this.framebuffer = fb;
    this.gl.bindFramebuffer(0x8d40, fb);
  }
}
