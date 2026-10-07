/**
 * @file shaders モジュールの公開窓口 (docs/02-directory-structure.md §15)。
 * プリプロセッサ、シェーダライブラリ、およびシェーダ型を公開する。
 */

export { preprocessShader, type PreprocessOptions } from './preprocess';
export {
  getBuiltinInclude,
  getShader,
  getAllShaderNames,
  registerShader,
  preprocessWithBuiltins,
  type ShaderSource,
} from './shader-library';
