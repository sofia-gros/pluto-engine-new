// カメラ uniform 構造体 (docs/07-renderer.md §6, 64 バイト)

struct CameraUniform {
  // ワールド→クリップ アフィン (a, b, c, d)
  viewProjAffine: vec4<f32>,
  // 平行移動 (tx, ty, 0.0, 0.0)
  viewProjTranslation: vec4<f32>,
  // カリング用ワールド矩形 (minX, minY, maxX, maxY)
  cullRect: vec4<f32>,
  // 画面解像度 (screenW, screenH, 1/screenW, 1/screenH)
  screenResolution: vec4<f32>,
};
