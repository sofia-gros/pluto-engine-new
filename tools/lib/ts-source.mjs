/**
 * @file TypeScript Compiler API による構文解析の共通関数。
 * 型検査はせず、1 ファイルずつ構文木を作って import・JSDoc・コメントを取り出す。
 */
import { readFileSync } from 'node:fs';
import ts from 'typescript';

export { ts };

/**
 * ファイルを構文解析する。
 * @param {string} file パス (.ts / .mjs / .js)
 * @returns {{ file: string, text: string, sf: ts.SourceFile, lines: string[] }}
 */
export function parseFile(file) {
  const text = readFileSync(file, 'utf8');
  const kind = file.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS;
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  return { file, text, sf, lines: text.split('\n') };
}

/**
 * ノード (または位置) の 1 始まりの行番号を返す。
 * @param {ts.SourceFile} sf
 * @param {number} pos
 * @returns {number}
 */
export function lineOf(sf, pos) {
  return sf.getLineAndCharacterOfPosition(pos).line + 1;
}

/**
 * import 宣言の情報を返す。
 * @param {ts.ImportDeclaration} node
 * @returns {{ spec: string, isTypeOnly: boolean, names: string[] }}
 */
function importDeclInfo(node) {
  const clause = node.importClause;
  const names = [];
  let isTypeOnly = clause !== undefined && clause.isTypeOnly;
  const bindings = clause?.namedBindings;
  if (bindings !== undefined && ts.isNamedImports(bindings)) {
    for (const el of bindings.elements) names.push((el.propertyName ?? el.name).text);
    const isAllTypes =
      bindings.elements.length > 0 && bindings.elements.every((el) => el.isTypeOnly);
    if (clause.name === undefined && isAllTypes) isTypeOnly = true;
  }
  return { spec: node.moduleSpecifier.text, isTypeOnly, names };
}

/**
 * export-from 宣言の情報を返す。
 * @param {ts.ExportDeclaration} node
 * @returns {{ spec: string, isTypeOnly: boolean, names: string[] }}
 */
function exportDeclInfo(node) {
  const names = [];
  if (node.exportClause !== undefined && ts.isNamedExports(node.exportClause)) {
    for (const el of node.exportClause.elements) names.push((el.propertyName ?? el.name).text);
  }
  return { spec: node.moduleSpecifier.text, isTypeOnly: node.isTypeOnly, names };
}

/**
 * ノードが import / export-from / 動的 import ならその情報を返す。
 * @param {ts.Node} node
 * @returns {{ spec: string, isTypeOnly: boolean, names: string[] } | undefined}
 */
function moduleRefOf(node) {
  if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
    return importDeclInfo(node);
  }
  if (
    ts.isExportDeclaration(node) &&
    node.moduleSpecifier !== undefined &&
    ts.isStringLiteral(node.moduleSpecifier)
  ) {
    return exportDeclInfo(node);
  }
  const isDynamicImport =
    ts.isCallExpression(node) &&
    node.expression.kind === ts.SyntaxKind.ImportKeyword &&
    node.arguments.length > 0 &&
    ts.isStringLiteral(node.arguments[0]);
  return isDynamicImport
    ? { spec: node.arguments[0].text, isTypeOnly: false, names: [] }
    : undefined;
}

/**
 * import / export-from / 動的 import を列挙する。
 * @param {ts.SourceFile} sf
 * @returns {{ spec: string, isTypeOnly: boolean, line: number, names: string[] }[]}
 */
export function getImports(sf) {
  const out = [];
  const visit = (node) => {
    const ref = moduleRefOf(node);
    if (ref !== undefined) out.push({ ...ref, line: lineOf(sf, node.getStart()) });
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

/**
 * ファイル中の全コメント (重複なし) を位置順に返す。
 * @param {ts.SourceFile} sf
 * @returns {{ pos: number, end: number, text: string, line: number }[]}
 */
export function getAllComments(sf) {
  const text = sf.getFullText();
  const seen = new Map();
  const collect = (ranges) => {
    if (ranges === undefined) return;
    for (const r of ranges) {
      if (!seen.has(r.pos)) {
        seen.set(r.pos, {
          pos: r.pos,
          end: r.end,
          text: text.slice(r.pos, r.end),
          line: lineOf(sf, r.pos),
        });
      }
    }
  };
  const visit = (node) => {
    collect(ts.getLeadingCommentRanges(text, node.getFullStart()));
    collect(ts.getTrailingCommentRanges(text, node.getEnd()));
    ts.forEachChild(node, visit);
  };
  visit(sf);
  collect(ts.getLeadingCommentRanges(text, sf.endOfFileToken.getFullStart()));
  return [...seen.values()].sort((a, b) => a.pos - b.pos);
}

/**
 * ノードに付いた JSDoc (`/** *\/`) の本文を返す。
 * @param {ts.Node} node
 * @returns {string[]}
 */
export function getJsDocTexts(node) {
  const sf = node.getSourceFile();
  const text = sf.getFullText();
  const ranges = ts.getLeadingCommentRanges(text, node.getFullStart()) ?? [];
  return ranges.map((r) => text.slice(r.pos, r.end)).filter((c) => c.startsWith('/**'));
}

/**
 * ノードが型の位置にあるか (型注釈・型引数・型エイリアス本体など)。
 * @param {ts.Node} node
 * @returns {boolean}
 */
export function isInTypePosition(node) {
  for (let p = node.parent; p !== undefined; p = p.parent) {
    if (ts.isTypeNode(p) || ts.isTypeAliasDeclaration(p) || ts.isInterfaceDeclaration(p)) {
      return true;
    }
    if (ts.isExpressionWithTypeArguments(p) && ts.isHeritageClause(p.parent)) {
      return p.parent.token === ts.SyntaxKind.ImplementsKeyword;
    }
    if (ts.isStatement(p) || ts.isClassElement(p)) return false;
  }
  return false;
}

/** 名前を持つ宣言・プロパティのうち、その名前が値の参照にならないもの。 */
const NAME_HOLDERS = [
  ts.isPropertyAssignment,
  ts.isPropertyDeclaration,
  ts.isMethodDeclaration,
  ts.isPropertySignature,
  ts.isGetAccessor,
  ts.isSetAccessor,
  ts.isVariableDeclaration,
  ts.isParameter,
  ts.isFunctionDeclaration,
  ts.isClassDeclaration,
  ts.isBindingElement,
  ts.isPropertyAccessExpression,
];

/**
 * 識別子が値としての参照か (宣言名・プロパティ名・型位置を除く)。
 * @param {ts.Identifier} id
 * @returns {boolean}
 */
export function isValueReference(id) {
  const p = id.parent;
  if (p === undefined || isInTypePosition(id)) return false;
  if (NAME_HOLDERS.some((is) => is(p)) && p.name === id) return false;
  return !(ts.isImportSpecifier(p) || ts.isExportSpecifier(p) || ts.isImportClause(p));
}

/** ひらがな・カタカナを含むかの判定に使う正規表現。 */
/** 日本語 (ひらがな・カタカナ・漢字) を含むかの判定に使う正規表現。 */
export const JAPANESE_RE = /[぀-ヿ㐀-鿿]/;
