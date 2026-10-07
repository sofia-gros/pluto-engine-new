/**
 * @file WebGL2 版のバインドグループ (docs/06-rhi.md §4・§4.1・§5.1・§7、`docs/02` §12)。
 * RHI のエントリを UBO の binding とテクスチャユニットに割り当てる。
 * 割り当てはレイアウト局所の番号付けとパイプライン全体での結合の 2 段で行う。
 */
import { ErrorCode, PlutoError } from '../../core/debug';
import type { RhiBindGroup, RhiBindGroupLayout } from '../device';
import {
  BindingType,
  TextureDimension,
  type BindGroupEntryDesc,
  type BindGroupLayoutDesc,
} from '../types';
import { WebGlBuffer } from './webgl2-buffer';
import { WebGlSampler, WebGlTexture } from './webgl2-texture';

/** 1 スロットの種類。 */
export type WebGlSlotKind = 'buffer' | 'texture' | 'sampler';

/** レイアウト 1 エントリの割り当て。`binding` は局所番号。 */
export interface WebGlBindingSlot {
  /** 種類。 */
  readonly kind: WebGlSlotKind;
  /** UBO の binding またはテクスチャユニット (局所番号)。 */
  readonly binding: number;
}

/** 1 レイアウト分の割り当て。 */
export interface WebGlLayoutSlots {
  /** エントリ順のスロット。 */
  readonly slots: readonly WebGlBindingSlot[];
  /** UBO スロットの個数。 */
  readonly bufferCount: number;
  /** テクスチャユニットを消費するスロットの個数。 */
  readonly unitCount: number;
}

/**
 * 1 レイアウト分の割り当てを作る。UBO は binding 順、テクスチャ系は
 * ユニット順に 0 から数える。データテクスチャ化したバッファもユニットを
 * 消費する (シェーダ側は `usampler2D` で読む)。サンプラは直前までに組に
 * なっていないテクスチャ系と組んで同じユニットを使う。書き込み系は作れない。
 * @param entries レイアウトのエントリ並び
 * @returns 割り当て
 */
export function assignLayoutSlots(
  entries: readonly { stage: number; type: number }[],
): WebGlLayoutSlots {
  const slots: WebGlBindingSlot[] = [];
  let buffers = 0;
  let units = 0;
  let unpaired = -1;
  for (const e of entries) {
    if (e.type === BindingType.UniformBuffer) {
      slots.push({ kind: 'buffer', binding: buffers });
      buffers += 1;
      continue;
    }
    if (e.type === BindingType.StorageBufferRead || e.type === BindingType.Texture) {
      slots.push({ kind: 'texture', binding: units });
      units += 1;
      unpaired = slots.length - 1;
      continue;
    }
    if (e.type === BindingType.Sampler) {
      if (unpaired < 0) {
        throw new PlutoError(
          ErrorCode.InvalidArgument,
          'サンプラの前に組になっていないテクスチャがありません。テクスチャとサンプラは組で記述してください',
        );
      }
      const unit = slots[unpaired].binding;
      slots.push({ kind: 'sampler', binding: unit });
      unpaired = -1;
      continue;
    }
    throw new PlutoError(
      ErrorCode.UnsupportedFeature,
      '書き込みストレージは WebGL2 で使えません。読み取り専用にしてください',
    );
  }
  return { slots, bufferCount: buffers, unitCount: units };
}

/**
 * 複数レイアウトの局所番号を全体番号に直す。前のレイアウトの個数を足すだけ。
 * @param layouts レイアウトごとの割り当て
 * @returns 全体番号の表
 */
export function combineLayoutSlots(layouts: readonly WebGlLayoutSlots[]): WebGlBindingSlot[][] {
  const out: WebGlBindingSlot[][] = [];
  let bufferBase = 0;
  let unitBase = 0;
  for (const l of layouts) {
    const row: WebGlBindingSlot[] = [];
    for (const s of l.slots) {
      row.push({
        kind: s.kind,
        binding: s.binding + (s.kind === 'buffer' ? bufferBase : unitBase),
      });
    }
    out.push(row);
    bufferBase += l.bufferCount;
    unitBase += l.unitCount;
  }
  return out;
}

/** WebGL2 版のバインドグループレイアウト。 */
export class WebGlBindGroupLayout implements RhiBindGroupLayout {
  /** 生成時のエントリ並び。 */
  public readonly entries: readonly { stage: number; type: number }[];

  /** 割り当て。 */
  public readonly assigned: WebGlLayoutSlots;

  private destroyed = false;

  /**
   * レイアウトのラッパーを作る。生成は `WebGlDevice.createBindGroupLayout` からだけ呼ぶ。
   * @param desc 生成時の記述子
   */
  public constructor(desc: BindGroupLayoutDesc) {
    this.entries = desc.entries;
    this.assigned = assignLayoutSlots(desc.entries);
  }

  /**
   * レイアウトを破棄する。2 回呼んでも安全。GL オブジェクトは持たない。
   */
  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
  }
}

/** WebGL2 版のバインドグループ。 */
export class WebGlBindGroup implements RhiBindGroup {
  /** 生成時に使ったレイアウト。 */
  public readonly layout: RhiBindGroupLayout;

  /** 実リソースの並び。エンコーダが適用時に読む。 */
  public readonly resources: readonly BindGroupEntryDesc[];

  private destroyed = false;

  /**
   * バインドグループを作る。生成は `WebGlDevice.createBindGroup` からだけ呼ぶ。
   * @param layout 対応するレイアウト
   * @param resources 実リソースの並び
   */
  public constructor(layout: RhiBindGroupLayout, resources: readonly BindGroupEntryDesc[]) {
    this.layout = layout;
    this.resources = resources;
  }

  /**
   * バインドグループを破棄する。2 回呼んでも安全。GL オブジェクトは持たない。
   */
  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
  }
}

/**
 * テクスチャ系スロットが期待するサンプラ種別を求める。
 * 色テクスチャは次元で分け、データテクスチャ化したバッファは整数用になる。
 * @param entry 対応するエントリ
 * @returns GL のサンプラ種別。テクスチャ系でなければ `null`
 */
export function expectedSamplerType(entry: BindGroupEntryDesc): number | null {
  if (entry.texture instanceof WebGlTexture) {
    return entry.texture.dimension === TextureDimension.D2Array ? 0x8dc1 : 0x8b5e;
  }
  if (entry.buffer instanceof WebGlBuffer && entry.buffer.isStorage) return 0x8ddc;
  return null;
}

/**
 * 適用に必要なパイプライン側の情報。`WebGlRenderPipeline` が構造的に満たす。
 */
export interface WebGlPipelineSlots {
  /** 全体番号の割り当て表。 */
  readonly slots: readonly (readonly WebGlBindingSlot[])[];
  /** テクスチャ系スロット順のサンプラ種別。 */
  readonly samplerTypes: readonly number[];
  /** テクスチャ系スロット順のサンプラ位置。 */
  readonly samplerLocations: readonly (WebGLUniformLocation | null)[];
}

/** 適用に失敗したときの文言。走査内では文字列を作らない。 */
const BIND_GROUP_MISMATCH = 'バインドグループがパイプラインのレイアウトと合っていません';
const TEXTURE_MISMATCH = 'テクスチャ種別がシェーダと合っていません';

/**
 * バインドグループを適用する。GL 呼び出しはキャッシュ経由にする。
 * 異常は走査後にまとめて投げる (呼び出し側の HOT 規則に従う)。
 * @param gl GL コンテキスト
 * @param cache 状態キャッシュ
 * @param pipeline パイプライン側の情報
 * @param groups バインドグループ (最大 4、空きは `null`)
 */
export function applyBindGroups(
  gl: WebGL2RenderingContext,
  cache: WebGlStateCacheLike,
  pipeline: WebGlPipelineSlots,
  groups: readonly (WebGlBindGroup | null)[],
): void {
  let texOrdinal = 0;
  let failKind = 0;
  for (let g = 0; g < groups.length; g++) {
    const group = groups[g];
    if (group === null) continue;
    const slots =
      pipeline.slots[g]?.length === group.resources.length ? pipeline.slots[g] : undefined;
    if (slots === undefined) {
      failKind = 1;
      break;
    }
    for (let j = 0; j < slots.length; j++) {
      const slot = slots[j];
      const entry = group.resources[j];
      if (slot.kind === 'buffer' && entry.buffer instanceof WebGlBuffer) {
        cache.bindUniformRange(
          slot.binding,
          entry.buffer.gpuBuffer,
          entry.offsetBytes ?? 0,
          entry.sizeBytes ?? entry.buffer.sizeBytes,
        );
        continue;
      }
      if (slot.kind === 'texture') {
        if (!applyTexture(gl, cache, pipeline, slot.binding, entry, texOrdinal)) {
          failKind = 2;
          break;
        }
        texOrdinal += 1;
        continue;
      }
      if (slot.kind === 'sampler' && entry.sampler instanceof WebGlSampler) {
        cache.bindSampler(slot.binding, entry.sampler.gpu);
      }
    }
    if (failKind !== 0) break;
  }
  if (failKind === 1) {
    throw new PlutoError(ErrorCode.InvalidState, BIND_GROUP_MISMATCH);
  }
  if (failKind === 2) {
    throw new PlutoError(ErrorCode.InvalidState, TEXTURE_MISMATCH);
  }
}

/**
 * テクスチャ系スロット 1 個を適用する。
 * @param gl GL コンテキスト
 * @param cache 状態キャッシュ
 * @param pipeline パイプライン側の情報
 * @param unit 結び付ける単位
 * @param entry 対応するエントリ
 * @param ordinal テクスチャ系スロットの通し番号
 * @returns 適用できたら true
 */
function applyTexture(
  gl: WebGL2RenderingContext,
  cache: WebGlStateCacheLike,
  pipeline: WebGlPipelineSlots,
  unit: number,
  entry: BindGroupEntryDesc,
  ordinal: number,
): boolean {
  const texture = entry.texture;
  const buffer = entry.buffer;
  if (texture instanceof WebGlTexture) {
    cache.bindTexture2D(unit, texture.gpu);
  } else if (buffer instanceof WebGlBuffer) {
    cache.bindTexture2D(unit, buffer.gpuTexture);
  } else {
    return false;
  }
  const expected = expectedSamplerType(entry);
  if (expected === null) return false;
  if (pipeline.samplerTypes[ordinal] !== expected) return false;
  const location = pipeline.samplerLocations[ordinal];
  if (location === null) return false;
  gl.uniform1i(location, unit);
  return true;
}

/** 適用に必要なキャッシュ側の操作。`WebGlStateCache` が構造的に満たす。 */
export interface WebGlStateCacheLike {
  /** UBO の範囲を binding に結び付ける。 */
  bindUniformRange(binding: number, buffer: WebGLBuffer | null, offset: number, size: number): void;
  /** 2D テクスチャを単位に結び付ける。 */
  bindTexture2D(unit: number, texture: WebGLTexture | null): void;
  /** サンプラを単位に結び付ける。 */
  bindSampler(unit: number, sampler: WebGLSampler | null): void;
}
/**
 * エントリの実リソースが型に合っているか確かめる。
 * Uniform には UBO、Storage 読み取りにはデータテクスチャ化したバッファ、
 * Texture にはテクスチャ、Sampler にはサンプラが要る。
 * @param entry 検証するエントリ
 * @param index エラー文に使う添字
 */
export function validateBindGroupResource(entry: BindGroupEntryDesc, index: number): void {
  const at = `entries[${String(index)}]`;
  if (entry.type === BindingType.UniformBuffer) {
    if (!(entry.buffer instanceof WebGlBuffer) || entry.buffer.isStorage) {
      throw new PlutoError(ErrorCode.InvalidArgument, `${at} には UBO が必要です`);
    }
    return;
  }
  if (entry.type === BindingType.StorageBufferRead) {
    if (!(entry.buffer instanceof WebGlBuffer) || !entry.buffer.isStorage) {
      throw new PlutoError(
        ErrorCode.InvalidArgument,
        `${at} にはデータテクスチャ化したバッファが必要です`,
      );
    }
    return;
  }
  if (entry.type === BindingType.Texture) {
    if (!(entry.texture instanceof WebGlTexture)) {
      throw new PlutoError(ErrorCode.InvalidArgument, `${at} にはテクスチャが必要です`);
    }
    return;
  }
  if (entry.type === BindingType.Sampler) {
    if (!(entry.sampler instanceof WebGlSampler)) {
      throw new PlutoError(ErrorCode.InvalidArgument, `${at} にはサンプラが必要です`);
    }
  }
}
