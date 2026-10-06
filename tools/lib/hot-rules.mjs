/**
 * @file HOT ファイル規則 (.agents/rules/02-performance.md) の構文木による検査。
 * コンストラクタ本体・フィールド初期化子・モジュールのトップレベル・@cold 関数は初期化時のみ実行されるため対象外。
 */
import { getJsDocTexts, isValueReference, lineOf, ts } from './ts-source.mjs';

/** HOT で禁止する配列高階関数。 */
const HOF = new Set([
  'forEach',
  'map',
  'filter',
  'reduce',
  'some',
  'every',
  'find',
  'flatMap',
  'sort',
]);
/** ループ文の種類 (ループ内の try / throw の判定用)。 */
const LOOP_KINDS = new Set([
  ts.SyntaxKind.ForStatement,
  ts.SyntaxKind.ForOfStatement,
  ts.SyntaxKind.ForInStatement,
  ts.SyntaxKind.WhileStatement,
  ts.SyntaxKind.DoStatement,
]);

/** HOT で禁止される式・文と、その説明。 */
const HOT_RULES = [
  [ts.isObjectLiteralExpression, 'オブジェクトリテラル'],
  [ts.isArrayLiteralExpression, '配列リテラル'],
  [ts.isNewExpression, '`new` による確保'],
  [(n) => ts.isSpreadElement(n) || ts.isSpreadAssignment(n), 'スプレッド'],
  [ts.isArrayBindingPattern, '配列の分割代入'],
  [
    (n) => ts.isTemplateExpression(n) || ts.isNoSubstitutionTemplateLiteral(n),
    'テンプレート文字列',
  ],
  [
    (n) =>
      ts.isBinaryExpression(n) &&
      n.operatorToken.kind === ts.SyntaxKind.PlusToken &&
      (ts.isStringLiteral(n.left) || ts.isStringLiteral(n.right)),
    '文字列連結',
  ],
  [(n) => ts.isForOfStatement(n) || ts.isForInStatement(n), 'for...of / for...in'],
  [ts.isDeleteExpression, '`delete`'],
  [(n) => ts.isIdentifier(n) && n.text === 'arguments' && isValueReference(n), '`arguments`'],
];

/**
 * HOT で禁止される呼び出し (配列高階関数・Object.keys 等) なら説明を返す。
 * @param {ts.Node} node
 * @returns {string | undefined}
 */
function hotCallMessage(node) {
  if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression))
    return undefined;
  const name = node.expression.name.text;
  const obj = node.expression.expression;
  if (HOF.has(name)) return `配列高階関数 .${name}()`;
  if (
    ts.isIdentifier(obj) &&
    obj.text === 'Object' &&
    ['keys', 'values', 'entries'].includes(name)
  ) {
    return `Object.${name}()`;
  }
  return undefined;
}

/**
 * 子ノードを調べるときの実行区分を求める (docs/03-coding-standards.md §10)。
 * - `top`: モジュールのトップレベル (1 回だけ実行。ただしここで宣言した関数の本体は `hot`)
 * - `init`: コンストラクタ・フィールド初期化子・@cold 関数と、その中のクロージャ (初期化時のみ実行)
 * - `hot`: それ以外 (毎フレーム実行とみなして検査する)
 * @param {ts.Node} node
 * @param {'top' | 'init' | 'hot'} mode 親の区分
 * @returns {'top' | 'init' | 'hot'}
 */
function nextMode(node, mode) {
  const isInitMember =
    ts.isConstructorDeclaration(node) ||
    ts.isPropertyDeclaration(node) ||
    ts.isClassStaticBlockDeclaration(node);
  if (isInitMember) return 'init';
  if (!ts.isFunctionLike(node)) return mode;
  if (mode === 'init') return 'init';
  return getJsDocTexts(node).some((d) => /@cold\b/.test(d)) ? 'init' : 'hot';
}

/**
 * エラー経路 (`throw new ...`) の確保か。例外は毎フレームの経路ではないので対象外。
 * @param {ts.Node} node
 * @returns {boolean}
 */
function isThrownError(node) {
  return ts.isNewExpression(node) && ts.isThrowStatement(node.parent);
}

/**
 * HOT ファイルの規則違反を列挙する (.agents/rules/02-performance.md, docs/03-coding-standards.md §10)。
 * @param {{ sf: ts.SourceFile, lines: string[] }} parsed
 * @returns {{ line: number, message: string }[]}
 */
export function findHotViolations(parsed) {
  const { sf, lines } = parsed;
  const out = [];
  const report = (_file, line, message) => out.push({ line, message });
  const file = '';
  const isAllowed = (node) =>
    [node.getStart(), node.getEnd()].some((pos) =>
      /\/\/\s*pluto-allow:/.test(lines[lineOf(sf, pos) - 1]),
    );
  const bad = (node, msg) => {
    if (!isAllowed(node))
      report(file, lineOf(sf, node.getStart()), `HOT: ${msg} (行末に // pluto-allow: 理由 が必要)`);
  };
  for (const s of sf.statements) {
    const isExportFn =
      ts.isFunctionDeclaration(s) &&
      s.body !== undefined &&
      ts.getCombinedModifierFlags(s) & ts.ModifierFlags.Export;
    if (isExportFn && !getJsDocTexts(s).some((d) => /@(hot|cold)\b/.test(d))) {
      report(
        file,
        lineOf(sf, s.getStart()),
        `HOT: export 関数 '${s.name?.text}' の JSDoc に @hot か @cold が必要`,
      );
    }
  }
  const visit = (node, mode, inLoop) => {
    const isClosure = ts.isArrowFunction(node) || ts.isFunctionExpression(node);
    if (mode === 'hot' && isClosure) bad(node, 'クロージャ生成');
    const next = nextMode(node, mode);
    if (next === 'hot') {
      const rule = HOT_RULES.find(([test]) => test(node));
      if (rule !== undefined && !isThrownError(node)) bad(node, rule[1]);
      const callMsg = hotCallMessage(node);
      if (callMsg !== undefined) bad(node, callMsg);
      if (inLoop && (ts.isTryStatement(node) || ts.isThrowStatement(node)))
        bad(node, 'ループ内の try / throw');
    }
    const loop = ts.isFunctionLike(node) ? false : inLoop || LOOP_KINDS.has(node.kind);
    ts.forEachChild(node, (c) => visit(c, next, loop));
  };
  visit(sf, 'top', false);
  return out;
}
