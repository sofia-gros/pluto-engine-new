/**
 * @file ブラウザテスト用ハーネス (docs/10-testing-strategy.md §3)。
 * URL の `backend` / `build` を検証し、テスト対象のエンジンを読み込んで `window.__pluto` に公開する。
 * `build=src` は dev server 上の src を、`build=embed` は embed ビルド成果物 (`/dist/embed/pluto.debug.js`) を読む。
 */

/** ハーネスが受け付けるバックエンド。 */
export const HARNESS_BACKENDS = ['webgpu', 'webgl2'] as const;
/** ハーネスが受け付けるビルド。 */
export const HARNESS_BUILDS = ['src', 'embed'] as const;
/** バックエンド名。 */
export type HarnessBackend = (typeof HARNESS_BACKENDS)[number];
/** ビルド名。 */
export type HarnessBuild = (typeof HARNESS_BUILDS)[number];

/** embed ビルド成果物の URL (`pnpm build:embed` で作られる)。 */
export const EMBED_BUNDLE_URL = '/dist/embed/pluto.debug.js';

/** テストから参照するハーネスの状態。 */
export interface PlutoHarness {
  /** 要求されたバックエンド。 */
  readonly backend: HarnessBackend;
  /** 読み込んだビルド。 */
  readonly build: HarnessBuild;
  /** ページが crossOriginIsolated か。 */
  readonly crossOriginIsolated: boolean;
  /** ハーネス自身がコンパイルされたときの `__PARALLEL__` (dev server の define を確認する用)。 */
  readonly devParallel: boolean;
  /** ハーネス自身がコンパイルされたときの `__DEBUG__`。 */
  readonly devDebug: boolean;
  /** 読み込んだエンジンの `VERSION`。 */
  readonly version: string;
  /** 読み込んだエンジンの出所 (`src/index.ts` または embed 成果物の URL)。 */
  readonly source: string;
}

declare global {
  interface Window {
    /** ハーネスの状態。読み込み完了後に設定される。 */
    __pluto?: PlutoHarness;
  }
}

/**
 * 値が候補のいずれかであることを確かめる。
 * @param name パラメータ名
 * @param value URL の値
 * @param candidates 許可される値
 * @returns 検証済みの値
 */
function pick<T extends string>(name: string, value: string | null, candidates: readonly T[]): T {
  const found = candidates.find((c) => c === value);
  if (found === undefined) {
    throw new Error(`ハーネス: ${name}=${String(value)} は不正です (${candidates.join(' | ')})`);
  }
  return found;
}

/**
 * 読み込んだモジュールから VERSION を取り出す。
 * @param mod 動的 import の結果
 * @returns VERSION 文字列
 */
function versionOf(mod: unknown): string {
  if (
    typeof mod === 'object' &&
    mod !== null &&
    'VERSION' in mod &&
    typeof mod.VERSION === 'string'
  ) {
    return mod.VERSION;
  }
  throw new Error('ハーネス: 読み込んだエンジンに VERSION がありません');
}

const params = new URLSearchParams(window.location.search);
const backend = pick('backend', params.get('backend'), HARNESS_BACKENDS);
const build = pick('build', params.get('build') ?? 'src', HARNESS_BUILDS);
const source = build === 'embed' ? EMBED_BUNDLE_URL : 'src/index.ts';
const engine: unknown =
  build === 'embed'
    ? await import(/* @vite-ignore */ EMBED_BUNDLE_URL)
    : await import('../../../src/index');

window.__pluto = {
  backend,
  build,
  crossOriginIsolated: window.crossOriginIsolated,
  devParallel: __PARALLEL__,
  devDebug: __DEBUG__,
  version: versionOf(engine),
  source,
};
