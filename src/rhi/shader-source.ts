/**
 * @file シェーダソースの表現 (docs/06-rhi.md §6、`docs/02` §12)。
 * 同じ 1 本のシェーダを WebGPU (WGSL) と WebGL2 (GLSL) の両方で持つための入れ物。
 */

/** 1 本のシェーダのソースコード。 */
export interface ShaderSource {
  /** シェーダ名。コンパイルエラーのメッセージと devtools の表示に使う。 */
  readonly name: string;
  /** WebGPU 用。レンダーは `vs_main` / `fs_main`、コンピュートは `cs_` 接頭辞 + 名前。 */
  readonly wgsl?: string;
  /** WebGL2 用頂点シェーダ。 */
  readonly glslVertex?: string;
  /** WebGL2 用フラグメントシェーダ。 */
  readonly glslFragment?: string;
}
