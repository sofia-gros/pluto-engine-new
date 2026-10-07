/**
 * @file シェーダファイルの ?raw インポート型定義 (docs/02-directory-structure.md §15)。
 * Vite の ?raw クエリでインポートされる WGSL / GLSL の文字列型を提供する。
 */

declare module '*.wgsl?raw' {
  const content: string;
  export = content;
}

declare module '*.glsl?raw' {
  const content: string;
  export = content;
}

declare module '*.vert.glsl?raw' {
  const content: string;
  export = content;
}

declare module '*.frag.glsl?raw' {
  const content: string;
  export = content;
}
