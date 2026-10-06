/**
 * @file 空のシーン (計測基盤そのもののオーバーヘッドと vsync 解除の確認用)。
 */
import type { BenchScene } from '../bench-types';

/** 何もしないシーン。 */
export const scene: BenchScene = {
  name: 'empty',
  defaultCount: 0,
  setup(): void {
    // 準備するものはない
  },
};
