/**
 * @file ファイル配置の検査 (docs/02-directory-structure.md, docs/10-testing-strategy.md §2)。
 * 1. src/ と tools/ のファイルが 02 の表に記載されている
 * 2. tests/ bench/ examples/ のファイルが 02 §23〜24 のパターンに合う
 * 3. tests/unit/x.test.ts に対応する src/x.ts が存在する
 * 4. 必須ユニットテスト (10 §2.2) が存在する
 */
import { existsSync } from 'node:fs';
import { getAllFiles } from './lib/source-files.mjs';
import { parseDocTable } from './lib/doc-table.mjs';
import { MANDATORY_UNIT_TEST_PATTERNS } from './lib/rule-tables.mjs';
import { parseFile, ts } from './lib/ts-source.mjs';

const allowedFiles = parseDocTable('docs/02-directory-structure.md');
const errors = [];

// 1. src/ と tools/ は表に記載されたものだけ
for (const file of [...getAllFiles('src'), ...getAllFiles('tools')]) {
  if (!allowedFiles.has(file)) {
    errors.push(`${file}: docs/02-directory-structure.md の表に記載がありません`);
  }
}

// 2. tests/ bench/ examples/ のパターン (02 §23〜24)
const srcModules = new Set(['smoke']);
for (const f of getAllFiles('src')) {
  const parts = f.split('/');
  if (parts.length >= 3) srcModules.add(parts[1]);
}
const KEBAB = '[a-z0-9]+(?:-[a-z0-9]+)*';
const TEST_PATTERNS = [
  /^tests\/unit\/.+\.test\.ts$/,
  /^tests\/unit\/_helpers\/[^/]+\.ts$/,
  /^tests\/browser\/fixtures\/[^/]+$/,
  /^tests\/browser\/fixtures\/assets\/[^/]+\/.+\.png$/,
  /^tests\/browser\/helpers\/[^/]+\.ts$/,
  /^tests\/browser\/golden\/(webgpu|webgl2)\/[^/]+\.png$/,
];
for (const file of getAllFiles('tests')) {
  const spec = file.match(/^tests\/browser\/([^/]+)\/[^/]+\.spec\.ts$/);
  if (spec !== null) {
    if (!srcModules.has(spec[1])) {
      errors.push(`${file}: tests/browser/<モジュール名>/ のモジュール名が src/ に存在しません`);
    }
    continue;
  }
  if (!TEST_PATTERNS.some((re) => re.test(file))) {
    errors.push(`${file}: tests/ の許可パターン (02 §23) に合いません`);
  }
}
const BENCH_PATTERNS = [
  /^bench\/runner\.(html|ts)$/,
  /^bench\/bench-types\.ts$/,
  /^bench\/scenes\/[^/]+\.ts$/,
  /^bench\/baseline\.json$/,
];
for (const file of getAllFiles('bench')) {
  if (!BENCH_PATTERNS.some((re) => re.test(file))) {
    errors.push(`${file}: bench/ の許可パターン (02 §24) に合いません`);
  }
}
const EXAMPLE_PATTERNS = [
  new RegExp(`^examples/${KEBAB}/(index\\.html|main\\.ts)$`),
  new RegExp(`^examples/${KEBAB}/assets/[^/]+$`),
  /^examples\/shared-assets\/[^/]+$/,
];
for (const file of getAllFiles('examples')) {
  if (!EXAMPLE_PATTERNS.some((re) => re.test(file))) {
    errors.push(`${file}: examples/ の許可パターン (02 §24) に合いません`);
  }
}

// 3. ユニットテストに対応する src が存在する
for (const file of getAllFiles('tests/unit')) {
  const m = file.match(/^tests\/unit\/(.+)\.test\.ts$/);
  if (m === null || m[1].startsWith('_helpers/')) continue;
  if (!existsSync(`src/${m[1]}.ts`)) {
    errors.push(`${file}: 対応する src/${m[1]}.ts が存在しません`);
  }
}

// 4. 必須ユニットテスト
/**
 * 型定義だけのファイルか (実行時に値を生まない)。
 * @param {string} file
 * @returns {boolean}
 */
function isTypeOnlyFile(file) {
  const { sf } = parseFile(file);
  return sf.statements.every(
    (s) =>
      ts.isInterfaceDeclaration(s) ||
      ts.isTypeAliasDeclaration(s) ||
      (ts.isImportDeclaration(s) && s.importClause?.isTypeOnly === true) ||
      (ts.isExportDeclaration(s) && s.isTypeOnly),
  );
}
for (const file of getAllFiles('src')) {
  if (!file.endsWith('.ts') || file.endsWith('.d.ts') || file.endsWith('/index.ts')) continue;
  if (!MANDATORY_UNIT_TEST_PATTERNS.some((re) => re.test(file))) continue;
  const testFile = file.replace(/^src\//, 'tests/unit/').replace(/\.ts$/, '.test.ts');
  if (!existsSync(testFile) && !isTypeOnlyFile(file)) {
    errors.push(`${file}: 必須のユニットテスト ${testFile} がありません (10 §2.2)`);
  }
}

if (errors.length > 0) {
  for (const e of errors) console.error(`[ERROR] ${e}`);
  console.error(`check-structure: ${errors.length} 件の違反`);
  process.exit(1);
}
console.log('check-structure: OK');
