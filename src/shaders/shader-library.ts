/**
 * @file シェーダライブラリ (docs/02-directory-structure.md §15、docs/07-renderer.md §2)。
 * 全シェーダファイルを ?raw で読み込み、プリプロセス済みの ShaderSource を提供する。
 */

import { ErrorCode, PlutoError } from '../core/debug';
import { preprocessShader, type PreprocessOptions } from './preprocess';
import cameraGlsl from './common/camera.glsl?raw';
import cameraWgsl from './common/camera.wgsl?raw';
import constantsGlsl from './common/constants.glsl?raw';
import constantsWgsl from './common/constants.wgsl?raw';
import frameGlsl from './common/frame.glsl?raw';
import frameWgsl from './common/frame.wgsl?raw';
import spriteInstanceGlsl from './common/sprite-instance.glsl?raw';
import spriteInstanceWgsl from './common/sprite-instance.wgsl?raw';
import storageEmulationGlsl from './common/storage-emulation.glsl?raw';
import spriteFragGlsl from './sprite/sprite.frag.glsl?raw';
import spriteVertGlsl from './sprite/sprite.vert.glsl?raw';
import spriteWgsl from './sprite/sprite.wgsl?raw';
import prefixSumWgsl from './scan/prefix-sum.wgsl?raw';
import radixSortWgsl from './sort/radix-sort.wgsl?raw';
import resetArgsWgsl from './cull/reset-args.wgsl?raw';
import spriteCullWgsl from './cull/sprite-cull.wgsl?raw';
import sortKeysWgsl from './cull/sort-keys.wgsl?raw';

/** 1 本のシェーダのソースコード表現 (docs/06-rhi.md §6 互換)。 */
export interface ShaderSource {
  /** シェーダ名。コンパイルエラーのメッセージと devtools の表示に使う。 */
  readonly name: string;
  /** WebGPU 用。レンダーは vs_main / fs_main、コンピュートは cs_ 接頭辞 + 名前。 */
  readonly wgsl?: string;
  /** WebGL2 用頂点シェーダ。 */
  readonly glslVertex?: string;
  /** WebGL2 用フラグメントシェーダ。 */
  readonly glslFragment?: string;
}

/** 共通インクルードファイルのマップ。拡張子の有無どちらでも解決可能。 */
const BUILTIN_INCLUDES: Readonly<Record<string, string>> = {
  'common/constants': constantsWgsl,
  'common/constants.wgsl': constantsWgsl,
  'common/constants.glsl': constantsGlsl,
  'common/camera': cameraWgsl,
  'common/camera.wgsl': cameraWgsl,
  'common/camera.glsl': cameraGlsl,
  'common/sprite-instance': spriteInstanceWgsl,
  'common/sprite-instance.wgsl': spriteInstanceWgsl,
  'common/sprite-instance.glsl': spriteInstanceGlsl,
  'common/frame': frameWgsl,
  'common/frame.wgsl': frameWgsl,
  'common/frame.glsl': frameGlsl,
  'common/storage-emulation': storageEmulationGlsl,
  'common/storage-emulation.glsl': storageEmulationGlsl,
};

/**
 * 組み込みインクルード断片を取得する。
 * @param path インクルードパス (例: "common/constants.wgsl" または "common/constants")
 * @returns シェーダ断片文字列、見つからない場合は undefined
 */
export function getBuiltinInclude(path: string): string | undefined {
  return BUILTIN_INCLUDES[path];
}

/** 登録済みシェーダのマップ。 */
const SHADER_REGISTRY = new Map<string, ShaderSource>();

/**
 * シェーダソースを登録する (内部用またはテスト用)。
 * @param source 登録するシェーダソース
 */
export function registerShader(source: ShaderSource): void {
  SHADER_REGISTRY.set(source.name, source);
}

// 組み込みシェーダの初期登録
registerShader({
  name: 'sprite',
  wgsl: spriteWgsl,
  glslVertex: spriteVertGlsl,
  glslFragment: spriteFragGlsl,
});
registerShader({
  name: 'scan/prefix-sum',
  wgsl: prefixSumWgsl,
});
registerShader({
  name: 'sort/radix-sort',
  wgsl: radixSortWgsl,
});
registerShader({
  name: 'cull/reset-args',
  wgsl: resetArgsWgsl,
});
registerShader({
  name: 'cull/sprite-cull',
  wgsl: spriteCullWgsl,
});
registerShader({
  name: 'cull/sort-keys',
  wgsl: sortKeysWgsl,
});

/**
 * 組み込みインクルードリゾルバを組み込んだプリプロセスを実行する。
 * @param source 対象のシェーダ文字列
 * @param options 追加のオプション
 * @returns プリプロセス済みのシェーダ文字列
 */
export function preprocessWithBuiltins(source: string, options: PreprocessOptions = {}): string {
  const customResolver = options.resolveInclude;
  const mergedResolver = (path: string): string | undefined => {
    const builtin = getBuiltinInclude(path);
    if (builtin !== undefined) {
      return builtin;
    }
    return customResolver ? customResolver(path) : undefined;
  };

  return preprocessShader(source, {
    ...options,
    resolveInclude: mergedResolver,
  });
}

/**
 * 指定した名前のシェーダソースを取得する。
 * @param name シェーダ名
 * @returns 登録されている ShaderSource
 */
export function getShader(name: string): ShaderSource {
  const shader = SHADER_REGISTRY.get(name);
  if (!shader) {
    throw new PlutoError(ErrorCode.InvalidArgument, `未知のシェーダ名です: ${name}`);
  }
  return shader;
}

/**
 * 登録されているすべてのシェーダ名一覧を取得する。
 * @returns シェーダ名の配列
 */
export function getAllShaderNames(): readonly string[] {
  return Array.from(SHADER_REGISTRY.keys());
}
