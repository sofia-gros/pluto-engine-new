/**
 * @file 検査規則の表。依存表は `.agents/rules/03-architecture.md` をパースし、
 * 禁止 API (docs/03-coding-standards.md §7) と必須ユニットテスト (docs/10-testing-strategy.md §2.2) は
 * 文書の表をそのまま写した定数として持つ。文書を変更したらここも更新すること。
 */
import { readFileSync } from 'node:fs';

/** core 配下のモジュール名一覧 (`core/*` の展開に使う)。 */
export const CORE_MODULES = [
  'core/debug',
  'core/math',
  'core/memory',
  'core/events',
  'core/time',
  'core/ecs',
];

/** ルート直下のエントリファイルとモジュール名の対応。 */
export const ROOT_ENTRIES = {
  'src/index.ts': 'entry:index',
  'src/lowlevel.ts': 'entry:lowlevel',
  'src/worker-main.ts': 'entry:worker-main',
  'src/build-flags.d.ts': 'entry:build-flags',
};

/**
 * src 内のファイルパスからモジュール名を求める。
 * @param {string} file `src/` から始まる POSIX パス
 * @returns {string | null} モジュール名 (`core/ecs`, `jobs`, `entry:index` 等)。判定不能なら null
 */
export function moduleOf(file) {
  if (ROOT_ENTRIES[file] !== undefined) return ROOT_ENTRIES[file];
  const parts = file.split('/');
  if (parts[0] !== 'src' || parts.length < 3) return null;
  if (parts[1] === 'core') return parts.length >= 4 ? `core/${parts[2]}` : null;
  return parts[1];
}

/**
 * `.agents/rules/03-architecture.md` の依存表をパースする。
 * @returns {Map<string, Set<string> | 'all'>} モジュール名 → import してよいモジュール集合 ('all' は制限なし)
 */
export function loadDependencyTable() {
  const text = readFileSync('.agents/rules/03-architecture.md', 'utf8');
  const rows = [];
  for (const line of text.split('\n')) {
    const m = line.match(/^\|\s*`([^`]+)`\s*\|\s*(.+?)\s*\|\s*$/);
    if (m !== null) rows.push([m[1], m[2]]);
  }
  /** @type {Map<string, Set<string> | 'all'>} */
  const table = new Map();
  const seen = [];
  for (const [rawName, rawAllowed] of rows) {
    const name = ROOT_ENTRIES[rawName] ?? rawName;
    let allowed;
    if (rawAllowed.startsWith('すべて')) {
      allowed = 'all';
    } else if (rawAllowed.startsWith('上記すべて')) {
      allowed = new Set(seen);
    } else if (rawAllowed === 'なし') {
      allowed = new Set();
    } else {
      allowed = new Set();
      for (const m of rawAllowed.matchAll(/`([^`]+)`/g)) {
        if (m[1] === 'core/*') for (const c of CORE_MODULES) allowed.add(c);
        else allowed.add(m[1]);
      }
    }
    table.set(name, allowed);
    if (!name.startsWith('entry:')) seen.push(name);
  }
  return table;
}

/**
 * 禁止 API の表 (docs/03-coding-standards.md §7)。
 * `exceptions` はパスの前方一致 (末尾 `/` でディレクトリ) で判定する。
 */
export const FORBIDDEN_APIS = [
  { id: 'console', label: 'console.*', exceptions: ['src/core/debug/logger.ts'] },
  { id: 'Math.random', label: 'Math.random()', exceptions: [] },
  {
    id: 'clock',
    label: 'Date.now() / performance.now()',
    exceptions: ['src/core/time/clock.ts', 'src/devtools/'],
  },
  { id: 'timer', label: 'setTimeout / setInterval', exceptions: [] },
  { id: 'raf', label: 'requestAnimationFrame', exceptions: ['src/scene/game.ts'] },
  { id: 'worker', label: 'new Worker', exceptions: ['src/jobs/threaded-scheduler.ts'] },
  {
    id: 'sab',
    label: 'SharedArrayBuffer',
    exceptions: ['src/core/memory/buffer-factory.ts', 'src/jobs/'],
  },
  { id: 'gpu', label: "navigator.gpu / getContext('webgl2')", exceptions: ['src/rhi/'] },
  {
    id: 'dom',
    label: 'document / window',
    exceptions: [
      'src/input/',
      'src/scene/game.ts',
      'src/devtools/stats-overlay.ts',
      'src/assets/loaders/',
    ],
  },
  { id: 'eval', label: 'eval / new Function', exceptions: [] },
];

/**
 * パスが例外リストに該当するか。
 * @param {string} file POSIX パス
 * @param {readonly string[]} exceptions 例外 (前方一致)
 * @returns {boolean}
 */
export function isException(file, exceptions) {
  return exceptions.some((e) => (e.endsWith('/') ? file.startsWith(e) : file === e));
}

/**
 * ユニットテスト必須の src パターン (docs/10-testing-strategy.md §2.2)。
 * index.ts・*.d.ts・型定義のみのファイルは呼び出し側で除外する。
 */
export const MANDATORY_UNIT_TEST_PATTERNS = [
  /^src\/core\//,
  /^src\/jobs\/kernel\.ts$/,
  /^src\/jobs\/serial-scheduler\.ts$/,
  /^src\/transform\//,
  /^src\/assets\//,
  /^src\/compute\/cpu-[^/]+\.ts$/,
  /^src\/render\/sprite\/sprite-instance-layout\.ts$/,
  /^src\/render\/sprite\/sprite-pack-kernel\.ts$/,
  /^src\/render\/sprite\/sprite-cpu-cull-kernel\.ts$/,
  /^src\/render\/texture\/atlas-packer\.ts$/,
  /^src\/render\/texture\/frame-table\.ts$/,
  /^src\/render\/text\/text-layout\.ts$/,
  /^src\/render\/graphics\/shape-builder\.ts$/,
  /^src\/physics\//,
  /^src\/animation\//,
  /^src\/scene\/game-config\.ts$/,
  /^src\/input\//,
];
