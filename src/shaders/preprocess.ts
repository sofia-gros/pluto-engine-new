/**
 * @file シェーダのプリプロセッサ (docs/02-directory-structure.md §15、docs/07-renderer.md §2)。
 * #include の再帰的解決、循環検出、二重インクルード抑止、#define および #ifdef 条件分岐の展開を行う。
 */

import { ErrorCode, PlutoError } from '../core/debug';

/** プリプロセスの実行オプション。 */
export interface PreprocessOptions {
  /** インクルードパスからシェーダ断片文字列を返すリゾルバ。 */
  readonly resolveInclude?: (path: string) => string | undefined;
  /** 事前定義マクロ辞書。値が boolean の場合、true なら定義、false なら未定義。 */
  readonly defines?: Readonly<Record<string, string | number | boolean>>;
  /** 同じインクルードを一度だけ展開するかどうか。既定値は true。 */
  readonly once?: boolean;
}

/** 条件分岐のスタックフレーム。 */
interface ConditionFrame {
  isBranchActive: boolean;
  hasAnyBranchExecuted: boolean;
}

/** インクルード行の正規表現: #include "path" または #include <path> */
const INCLUDE_REGEX = /^\s*#include\s+["<]([^">]+)[">]\s*$/;

/** #define 行の正規表現: #define IDENTIFIER [VALUE] */
const DEFINE_REGEX = /^\s*#define\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s+(.*))?\s*$/;

/** #ifdef 行の正規表現 */
const IFDEF_REGEX = /^\s*#ifdef\s+([A-Za-z_][A-Za-z0-9_]*)\s*$/;

/** #ifndef 行の正規表現 */
const IFNDEF_REGEX = /^\s*#ifndef\s+([A-Za-z_][A-Za-z0-9_]*)\s*$/;

/** #else 行の正規表現 */
const ELSE_REGEX = /^\s*#else\s*$/;

/** #endif 行の正規表現 */
const ENDIF_REGEX = /^\s*#endif\s*$/;

/**
 * 現在の条件スタックがアクティブ（親ブロック含めすべて有効）かどうかを判定する。
 * @param stack 条件スタック
 * @returns 有効な場合は true
 */
function isStackActive(stack: readonly ConditionFrame[]): boolean {
  if (stack.length === 0) {
    return true;
  }
  const top = stack[stack.length - 1];
  return top.isBranchActive;
}

/**
 * 親の条件スタックがアクティブかどうかを判定する。
 * @param stack 条件スタック
 * @param depth 対象の深さ
 * @returns 有効な場合は true
 */
function isParentActive(stack: readonly ConditionFrame[], depth: number): boolean {
  if (depth <= 0) {
    return true;
  }
  const parent = stack[depth - 1];
  return parent.isBranchActive;
}

/**
 * #ifdef または #ifndef を処理する。
 * @param macro マクロ名
 * @param isNegated #ifndef の場合は true
 * @param stack 条件スタック
 * @param definedMacros 定義済みマクロマップ
 */
function handleIfdef(
  macro: string,
  isNegated: boolean,
  stack: ConditionFrame[],
  definedMacros: ReadonlyMap<string, string | undefined>,
): void {
  const isParent = isStackActive(stack);
  const isMacroDefined = definedMacros.has(macro);
  const isConditionMet = isNegated ? !isMacroDefined : isMacroDefined;
  const shouldActivate = isParent && isConditionMet;
  stack.push({ isBranchActive: shouldActivate, hasAnyBranchExecuted: shouldActivate });
}

/**
 * #else を処理する。
 * @param stack 条件スタック
 */
function handleElse(stack: ConditionFrame[]): void {
  if (stack.length === 0) {
    throw new PlutoError(ErrorCode.InvalidArgument, '#else に対応する #if / #ifdef がありません');
  }
  const top = stack[stack.length - 1];
  const isParent = isParentActive(stack, stack.length - 1);
  const shouldActivate = isParent && !top.hasAnyBranchExecuted;
  top.isBranchActive = shouldActivate;
  if (shouldActivate) {
    top.hasAnyBranchExecuted = true;
  }
}

/**
 * #endif を処理する。
 * @param stack 条件スタック
 */
function handleEndif(stack: ConditionFrame[]): void {
  if (stack.length === 0) {
    throw new PlutoError(ErrorCode.InvalidArgument, '#endif に対応する #if / #ifdef がありません');
  }
  stack.pop();
}

/**
 * 1 行のプリプロセッサディレクティブを評価する。
 * @param line 評価対象行
 * @param stack 条件スタック
 * @param definedMacros 定義済みマクロマップ
 * @returns ディレクティブとして処理された場合は true、通常行の場合は false
 */
function processDirective(
  line: string,
  stack: ConditionFrame[],
  definedMacros: Map<string, string | undefined>,
): boolean {
  const ifdefMatch = IFDEF_REGEX.exec(line);
  if (ifdefMatch) {
    const macro = ifdefMatch[1];
    if (macro) {
      handleIfdef(macro, false, stack, definedMacros);
    }
    return true;
  }

  const ifndefMatch = IFNDEF_REGEX.exec(line);
  if (ifndefMatch) {
    const macro = ifndefMatch[1];
    if (macro) {
      handleIfdef(macro, true, stack, definedMacros);
    }
    return true;
  }

  if (ELSE_REGEX.test(line)) {
    handleElse(stack);
    return true;
  }

  if (ENDIF_REGEX.test(line)) {
    handleEndif(stack);
    return true;
  }

  if (!isStackActive(stack)) {
    return true;
  }

  const defineMatch = DEFINE_REGEX.exec(line);
  if (defineMatch) {
    const key = defineMatch[1];
    if (key) {
      const rawVal = defineMatch[2];
      const val = rawVal ? rawVal.trim() : undefined;
      definedMacros.set(key, val);
    }
    return true;
  }

  return false;
}

/**
 * 条件分岐と #define を評価して有効な行を抽出する。
 * @param source 元のソース文字列
 * @param definedMacros 定義マクロマップ
 * @returns 抽出された行配列
 */
function evaluateConditionals(
  source: string,
  definedMacros: Map<string, string | undefined>,
): string[] {
  const lines = source.split(/\r?\n/);
  const resultLines: string[] = [];
  const conditionStack: ConditionFrame[] = [];

  for (const line of lines) {
    const isDirective = processDirective(line, conditionStack, definedMacros);
    if (!isDirective && isStackActive(conditionStack)) {
      resultLines.push(line);
    }
  }

  if (conditionStack.length > 0) {
    throw new PlutoError(ErrorCode.InvalidArgument, '#endif が閉じられていません');
  }

  return resultLines;
}

/**
 * 再帰的に #include を解決してソースコードを組み立てる。
 * @param source 元のソース文字列
 * @param options プリプロセッサ設定
 * @param includeStack 現在のインクルードパスのスタック (循環検出用)
 * @param resolvedSet 展開済みのインクルードパス (include once 用)
 * @param definedMacros 定義済みマクロマップ
 * @returns 展開後のソースコード
 */
function processRecursive(
  source: string,
  options: PreprocessOptions,
  includeStack: string[],
  resolvedSet: Set<string>,
  definedMacros: Map<string, string | undefined>,
): string {
  const lines = evaluateConditionals(source, definedMacros);
  const outputLines: string[] = [];

  for (const line of lines) {
    const includeMatch = INCLUDE_REGEX.exec(line);
    if (!includeMatch) {
      outputLines.push(line);
      continue;
    }

    const includePath = includeMatch[1];
    if (!includePath) {
      continue;
    }

    if (includeStack.includes(includePath)) {
      const cycle = [...includeStack, includePath].join(' -> ');
      throw new PlutoError(ErrorCode.InvalidArgument, `循環インクルードを検出しました: ${cycle}`);
    }

    const isOnce = options.once !== false;
    if (isOnce && resolvedSet.has(includePath)) {
      continue;
    }

    if (!options.resolveInclude) {
      throw new PlutoError(
        ErrorCode.InvalidArgument,
        `インクルードリゾルバが設定されていません: ${includePath}`,
      );
    }

    const resolvedContent = options.resolveInclude(includePath);
    if (resolvedContent === undefined) {
      throw new PlutoError(
        ErrorCode.InvalidArgument,
        `インクルードファイルが見つかりません: ${includePath}`,
      );
    }

    resolvedSet.add(includePath);
    includeStack.push(includePath);

    const expanded = processRecursive(
      resolvedContent,
      options,
      includeStack,
      resolvedSet,
      definedMacros,
    );

    includeStack.pop();

    if (expanded.length > 0) {
      outputLines.push(expanded);
    }
  }

  return outputLines.join('\n');
}

/**
 * シェーダコードを前処理し、#include や #define / #ifdef ディレクティブを展開する。
 * @param source 前処理対象のシェーダ文字列
 * @param options 前処理オプション
 * @returns 前処理済みのシェーダ文字列
 */
export function preprocessShader(source: string, options: PreprocessOptions = {}): string {
  const definedMacros = new Map<string, string | undefined>();

  if (options.defines) {
    for (const [k, v] of Object.entries(options.defines)) {
      if (typeof v === 'boolean') {
        if (v) {
          definedMacros.set(k, undefined);
        }
      } else {
        definedMacros.set(k, String(v));
      }
    }
  }

  const includeStack: string[] = [];
  const resolvedSet = new Set<string>();

  return processRecursive(source, options, includeStack, resolvedSet, definedMacros);
}
