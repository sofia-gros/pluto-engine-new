/**
 * @file 禁止パターン・JSDoc・HOT 規則・行数の検査
 * (.agents/rules/01〜02, docs/03-coding-standards.md §1〜§10, docs/10-testing-strategy.md §2)。
 */
import { readFileSync, existsSync } from 'node:fs';
import { getSourceFiles } from './lib/source-files.mjs';
import { parseDocTable } from './lib/doc-table.mjs';
import { FORBIDDEN_APIS, isException } from './lib/rule-tables.mjs';
import { findHotViolations } from './lib/hot-rules.mjs';
import {
  JAPANESE_RE,
  getAllComments,
  getJsDocTexts,
  isInTypePosition,
  isValueReference,
  lineOf,
  parseFile,
  ts,
} from './lib/ts-source.mjs';

const docTable = parseDocTable('docs/02-directory-structure.md');
const progress = existsSync('docs/progress/PROGRESS.md')
  ? readFileSync('docs/progress/PROGRESS.md', 'utf8')
  : '';
const errors = [];
/** @param {string} file @param {number} line @param {string} msg */
const report = (file, line, msg) => errors.push(`${file}:${line}: ${msg}`);

/** 共通: 禁止キャスト・any・非 null アサーション・抑制コメント (src/tests/bench/tools)。 */
function checkCommon(parsed) {
  const { file, sf } = parsed;
  for (const c of getAllComments(sf)) {
    if (/@ts-(ignore|expect-error|nocheck)/.test(c.text)) {
      report(file, c.line, '@ts-ignore 等の抑制コメントは禁止');
    }
    if (/eslint-disable/.test(c.text)) report(file, c.line, 'eslint-disable は禁止');
  }
  const RULES = [
    [
      (n) =>
        ts.isAsExpression(n) &&
        n.type.kind === ts.SyntaxKind.UnknownKeyword &&
        ts.isAsExpression(n.parent),
      '`as unknown as` は禁止',
    ],
    [(n) => n.kind === ts.SyntaxKind.AnyKeyword, '`any` は禁止'],
    [(n) => ts.isNonNullExpression(n), '非 null アサーション `!` は禁止'],
    [
      (n) => ts.isPropertyDeclaration(n) && n.exclamationToken !== undefined,
      '確定代入アサーション `!:` は禁止',
    ],
  ];
  const visit = (node) => {
    for (const [test, msg] of RULES) if (test(node)) report(file, lineOf(sf, node.getStart()), msg);
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

/** `a.b` 形式の禁止 API (キー → FORBIDDEN_APIS の id)。 */
const MEMBER_APIS = new Map([
  ['Math.random', 'Math.random'],
  ['Date.now', 'clock'],
  ['performance.now', 'clock'],
  ['navigator.gpu', 'gpu'],
]);
/** グローバル名で参照される禁止 API。`globalThis.x` 等でも検出する。 */
const GLOBAL_APIS = new Map([
  ['setTimeout', 'timer'],
  ['setInterval', 'timer'],
  ['requestAnimationFrame', 'raf'],
  ['SharedArrayBuffer', 'sab'],
  ['document', 'dom'],
  ['window', 'dom'],
  ['eval', 'eval'],
]);
/** `new X` 形式の禁止 API。 */
const NEW_APIS = new Map([
  ['Worker', 'worker'],
  ['Function', 'eval'],
]);
const GLOBAL_OBJECTS = new Set(['globalThis', 'window', 'self']);

/**
 * ノードが禁止 API の使用なら FORBIDDEN_APIS の id を返す。
 * @param {ts.Node} node
 * @returns {string | undefined}
 */
function forbiddenApiOf(node) {
  if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) {
    if (isInTypePosition(node)) return undefined;
    const obj = node.expression.text;
    if (obj === 'console') return 'console';
    if (GLOBAL_OBJECTS.has(obj) && GLOBAL_APIS.has(node.name.text)) {
      return GLOBAL_APIS.get(node.name.text);
    }
    return MEMBER_APIS.get(`${obj}.${node.name.text}`);
  }
  if (ts.isIdentifier(node)) return isValueReference(node) ? GLOBAL_APIS.get(node.text) : undefined;
  if (ts.isNewExpression(node) && ts.isIdentifier(node.expression)) {
    return NEW_APIS.get(node.expression.text);
  }
  if (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    node.expression.name.text === 'getContext'
  ) {
    const a = node.arguments[0];
    return a !== undefined && ts.isStringLiteral(a) && a.text === 'webgl2' ? 'gpu' : undefined;
  }
  return undefined;
}

/** src: 禁止 API (03 §7)。 */
function checkForbiddenApis(parsed) {
  const { file, sf } = parsed;
  const visit = (node) => {
    const id = forbiddenApiOf(node);
    if (id !== undefined) {
      const rule = FORBIDDEN_APIS.find((r) => r.id === id);
      if (!isException(file, rule.exceptions)) {
        report(file, lineOf(sf, node.getStart()), `${rule.label} は禁止 (03 §7)`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

/** src: ファイル見出し・JSDoc の日本語・TODO・pluto-allow・行数。 */
function checkComments(parsed) {
  const { file, sf, lines } = parsed;
  const comments = getAllComments(sf);
  const jsdocs = comments.filter((c) => c.text.startsWith('/**'));
  const firstStmt = sf.statements[0];
  const header = jsdocs[0];
  const isHeaderOk =
    header !== undefined &&
    header.text.includes('@file') &&
    (firstStmt === undefined || header.pos < firstStmt.getStart());
  if (!isHeaderOk) report(file, 1, 'ファイル先頭に `/** @file 日本語の説明 */` が必要');
  for (const c of jsdocs) {
    if (!JAPANESE_RE.test(c.text)) report(file, c.line, 'JSDoc には日本語を含めること');
  }
  for (const c of comments) {
    for (const m of c.text.matchAll(/TODO(\(([^)]*)\))?/g)) {
      if (m[2] === undefined || !/^T-[0-9A-Z]+\.[0-9]+$/.test(m[2])) {
        report(file, c.line, 'TODO は `TODO(T-x.y): 説明` の形式で書くこと');
      } else if (!progress.includes(`| ${m[2]} `)) {
        report(file, c.line, `TODO のタスク ${m[2]} が PROGRESS.md にありません`);
      }
    }
    const allow = c.text.match(/pluto-allow:?(.*)$/);
    if (allow !== null && !(c.text.includes('pluto-allow:') && JAPANESE_RE.test(allow[1]))) {
      report(file, c.line, '`// pluto-allow:` には日本語の理由が必要');
    }
  }
  if (lines.length > 400) report(file, 401, `400 行を超えています (${lines.length} 行)`);
}

/** src: モジュールの index.ts は re-export とコメントのみ。 */
function checkModuleIndex(parsed) {
  const { file, sf } = parsed;
  for (const s of sf.statements) {
    if (!ts.isExportDeclaration(s) || s.moduleSpecifier === undefined) {
      report(file, lineOf(sf, s.getStart()), 'index.ts には re-export とコメントのみ書けます');
    } else if (s.exportClause === undefined) {
      report(file, lineOf(sf, s.getStart()), '`export *` は禁止 (名前を列挙する)');
    }
  }
}

/**
 * ノードに (ファイル見出し以外の) JSDoc が無ければ報告する。
 * @param {{ file: string, sf: ts.SourceFile }} parsed
 * @param {ts.Node} node
 * @param {string} name
 */
function needDoc(parsed, node, name) {
  const docs = getJsDocTexts(node).filter((d) => !d.includes('@file')); // ファイル見出しは除く
  if (docs.length === 0) {
    report(
      parsed.file,
      lineOf(parsed.sf, node.getStart()),
      `公開シンボル '${name}' に日本語 JSDoc がありません`,
    );
  }
}

/**
 * export されたクラスの public メンバーの JSDoc (get/set はどちらかにあればよい)。
 * @param {{ file: string, sf: ts.SourceFile }} parsed
 * @param {ts.ClassDeclaration} cls
 */
function checkClassMemberDocs(parsed, cls) {
  const documented = new Set();
  const pending = [];
  for (const m of cls.members) {
    if (ts.isConstructorDeclaration(m) || ts.isClassStaticBlockDeclaration(m)) continue;
    const isHidden =
      ts.getCombinedModifierFlags(m) & (ts.ModifierFlags.Private | ts.ModifierFlags.Protected);
    if (isHidden || m.name === undefined || ts.isPrivateIdentifier(m.name)) continue;
    const name = m.name.getText();
    if (getJsDocTexts(m).length > 0) documented.add(name);
    else pending.push([m, name]);
  }
  for (const [m, name] of pending) {
    if (!documented.has(name)) needDoc(parsed, m, `${cls.name?.text}.${name}`);
  }
}

/** src: 公開シンボルの JSDoc (03 §10)。 */
function checkExportDocs(parsed) {
  for (const s of parsed.sf.statements) {
    if (!(ts.getCombinedModifierFlags(s) & ts.ModifierFlags.Export)) continue;
    if (ts.isVariableStatement(s)) {
      needDoc(parsed, s, s.declarationList.declarations.map((d) => d.name.getText()).join(', '));
    } else if (ts.isFunctionDeclaration(s) && s.body === undefined) {
      continue; // オーバーロード宣言は実装側で見る
    } else if (
      ts.isFunctionDeclaration(s) ||
      ts.isInterfaceDeclaration(s) ||
      ts.isTypeAliasDeclaration(s)
    ) {
      needDoc(parsed, s, s.name?.text ?? '(無名)');
    } else if (ts.isClassDeclaration(s)) {
      needDoc(parsed, s, s.name?.text ?? '(無名)');
      checkClassMemberDocs(parsed, s);
    }
  }
}

/** tests: 実時間・乱数・スナップショット・skip/only。 */
function checkTests(parsed) {
  const { file, sf, lines } = parsed;
  if (lines.length > 800) report(file, 801, `テストは 800 行まで (${lines.length} 行)`);
  const visit = (node) => {
    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) {
      const key = `${node.expression.text}.${node.name.text}`;
      if (
        file.startsWith('tests/unit/') &&
        ['Math.random', 'Date.now', 'performance.now'].includes(key)
      ) {
        report(
          file,
          lineOf(sf, node.getStart()),
          `${key} はテストで禁止 (createRng / ManualClock を使う)`,
        );
      }
      if (
        ['skip', 'only'].includes(node.name.text) &&
        ['it', 'test', 'describe'].includes(node.expression.text)
      ) {
        report(file, lineOf(sf, node.getStart()), `${key} は禁止`);
      }
    }
    if (ts.isIdentifier(node) && /^toMatch(Inline)?Snapshot$/.test(node.text)) {
      report(file, lineOf(sf, node.getStart()), 'スナップショットテストは禁止 (10 §2.5)');
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

for (const file of getSourceFiles('src')) {
  const parsed = parseFile(file);
  const meta = docTable.get(file);
  const isHot = meta?.hot === true;
  const hasMarker = parsed.lines[0].trim() === '// @pluto-hot';
  if (isHot && !hasMarker) report(file, 1, 'HOT ファイルは 1 行目に `// @pluto-hot` が必要');
  if (!isHot && parsed.text.includes('@pluto-hot'))
    report(file, 1, 'HOT でないファイルに `@pluto-hot` があります (02 の表と不一致)');
  checkCommon(parsed);
  checkForbiddenApis(parsed);
  checkComments(parsed);
  if (/^src\/.+\/index\.ts$/.test(file)) checkModuleIndex(parsed);
  else if (!file.endsWith('.d.ts')) checkExportDocs(parsed);
  if (isHot) for (const v of findHotViolations(parsed)) report(file, v.line, v.message);
}
for (const file of getSourceFiles('tests')) {
  const parsed = parseFile(file);
  checkCommon(parsed);
  checkTests(parsed);
}
for (const file of [...getSourceFiles('bench'), ...getSourceFiles('tools', ['.mjs'])]) {
  checkCommon(parseFile(file));
}

if (errors.length > 0) {
  for (const e of errors) console.error(`[ERROR] ${e}`);
  console.error(`check-rules: ${errors.length} 件の違反`);
  process.exit(1);
}
console.log('check-rules: OK');
