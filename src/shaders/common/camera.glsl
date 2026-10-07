// カメラ uniform 構造体 (docs/07-renderer.md §6, 64 バイト, std140)

struct CameraUniform {
  // ワールド→クリップ アフィン (a, b, c, d)
  vec4 viewProjAffine;
  // 平行移動 (tx, ty, 0.0, 0.0)
  vec4 viewProjTranslation;
  // カリング用ワールド矩形 (minX, minY, maxX, maxY)
  vec4 cullRect;
  // 画面解像度 (screenW, screenH, 1/screenW, 1/screenH)
  vec4 screenResolution;
};
