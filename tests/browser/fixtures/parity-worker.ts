/**
 * @file パリティテスト用の Worker エントリ (docs/05-jobs-and-builds.md §3.3)。
 * テスト用カーネルを import してレジストリを満たし、runWorkerLoop を呼ぶ。
 */
import type { ToWorkerMessage, WorkerPort } from '../../../src/jobs';
import { runWorkerLoop } from '../../../src/jobs';
import './parity-kernels';

/** init メッセージで渡されるデータの形。 */
interface InitPayload {
  readonly type: 'init';
  readonly port: MessagePort;
}

/**
 * メッセージが Worker の初期化メッセージかどうかと、その中のポートを取り出す。
 * @param data 受信したデータ
 * @returns 初期化メッセージなら中のポート、そうでなければ null
 */
function readInitPort(data: unknown): MessagePort | null {
  if (typeof data !== 'object' || data === null) return null;
  const payload = data as Partial<InitPayload>;
  if (payload.type !== 'init') return null;
  return payload.port ?? null;
}

/** ポートの最小形を WorkerPort に包んで runWorkerLoop に渡す。 */
const port: WorkerPort = {
  post: (message) => {
    initPort?.postMessage(message);
  },
  listen: (handler) => {
    if (initPort === null) return;
    initPort.onmessage = (event: MessageEvent<ToWorkerMessage>) => {
      handler(event.data);
    };
  },
  close: () => {
    initPort?.close();
  },
};

/** 受信した初期化メッセージから取り出したポート。 */
let initPort: MessagePort | null = null;

self.onmessage = (event: MessageEvent<unknown>) => {
  const received = readInitPort(event.data);
  if (received === null) return;
  initPort = received;
  runWorkerLoop(port);
};
