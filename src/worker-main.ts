/**
 * @file Worker のエントリ (docs/05-jobs-and-builds.md §3.3)。
 * 組込カーネルを定義するモジュールを import してカーネル登録表を満たし、ジョブループを開始する。
 * カーネルを追加したモジュールは、そのタスクでここに import を追記する (T-2.4: transform、T-4.3 / T-4.4: render、T-8.1: physics)。
 */
import { runWorkerLoop } from './jobs';
import type { FromWorkerMessage, ToWorkerMessage } from './jobs';
// 組込カーネルの登録表をメインと同じにする (docs/05 §3.3)。
import './transform';

runWorkerLoop({
  post: (message: FromWorkerMessage): void => {
    self.postMessage(message);
  },
  listen: (handler: (message: ToWorkerMessage) => void): void => {
    self.addEventListener('message', (event: MessageEvent<ToWorkerMessage>) => {
      handler(event.data);
    });
  },
  close: (): void => {
    self.close();
  },
});
