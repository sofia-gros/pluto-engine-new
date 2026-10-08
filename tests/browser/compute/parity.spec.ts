/**
 * @file GPU プリミティブ vs CPU 参照実装パリティテスト (docs/10-testing-strategy.md §4, T-4.5)。
 * GPU 排他的プレフィックスサムおよび LSD 基数ソートが、CPU 参照実装と完全一致することを検証する。
 */

import { expect, test } from '../helpers/harness-test';

test.describe('GPU プリミティブ パリティテスト (T-4.5)', () => {
  test('WebGL2 では caps.compute === false および UnsupportedFeature 送出を検証', async ({
    page,
    plutoBackend,
  }) => {
    await page.goto(`/tests/browser/fixtures/harness.html?backend=${plutoBackend}&build=src`);

    const result = await page.evaluate(async (backend) => {
      const { ErrorCode, PlutoError } = await import('../../../src/core/debug');
      const { createDevice } = await import('../../../src/rhi');
      const { GpuPrefixSum, GpuRadixSort } = await import('../../../src/compute');
      const canvas = document.getElementById('pluto-canvas') as HTMLCanvasElement;
      let device;
      try {
        device = await createDevice({ canvas, backend });
      } catch {
        return { isUnsupported: true, success: true };
      }

      if (!device.caps.compute) {
        let hasPrefixSumThrown = false;
        let hasRadixSortThrown = false;
        try {
          new GpuPrefixSum(device);
        } catch (e) {
          if (e instanceof PlutoError && e.code === ErrorCode.UnsupportedFeature) {
            hasPrefixSumThrown = true;
          }
        }
        try {
          new GpuRadixSort(device);
        } catch (e) {
          if (e instanceof PlutoError && e.code === ErrorCode.UnsupportedFeature) {
            hasRadixSortThrown = true;
          }
        }
        device.destroy();
        return { isUnsupported: true, success: hasPrefixSumThrown && hasRadixSortThrown };
      }

      device.destroy();
      return { isUnsupported: false, success: true };
    }, plutoBackend);

    expect(result.success).toBe(true);
  });

  test('WebGPU では CPU 参照実装と結果が完全一致する (Prefix Sum & Radix Sort)', async ({
    page,
    plutoBackend,
  }) => {
    await page.goto(`/tests/browser/fixtures/harness.html?backend=${plutoBackend}&build=src`);

    const result = await page.evaluate(async (backend) => {
      const { createDevice, BufferUsage } = await import('../../../src/rhi');
      const { GpuPrefixSum, GpuRadixSort } = await import('../../../src/compute');
      const canvas = document.getElementById('pluto-canvas') as HTMLCanvasElement;
      let device;
      try {
        device = await createDevice({ canvas, backend });
      } catch {
        // WebGPU アダプタ不在環境
        return { skipped: true, passed: true };
      }

      if (!device.caps.compute) {
        device.destroy();
        return { skipped: true, passed: true };
      }

      // 擬似乱数生成 (Xorshift32)
      function makeRng(seed: number) {
        let s = seed >>> 0;
        return () => {
          s ^= s << 13;
          s ^= s >>> 17;
          s ^= s << 5;
          return s >>> 0;
        };
      }

      // CPU 参照実装
      function cpuPrefixSum(input: Uint32Array): Uint32Array {
        const out = new Uint32Array(input.length);
        let sum = 0;
        for (let i = 0; i < input.length; i++) {
          out[i] = sum;
          sum = (sum + input[i]) >>> 0;
        }
        return out;
      }

      function cpuRadixSort(
        keys: Uint32Array,
        values: Uint32Array,
      ): { keys: Uint32Array; values: Uint32Array } {
        const n = keys.length;
        let curK = new Uint32Array(keys);
        let curV = new Uint32Array(values);
        let nextK = new Uint32Array(n);
        let nextV = new Uint32Array(n);
        const count = new Uint32Array(16);
        const offset = new Uint32Array(16);

        for (let p = 0; p < 8; p++) {
          const shift = p * 4;
          count.fill(0);
          for (let i = 0; i < n; i++) {
            count[(curK[i] >>> shift) & 0xf]++;
          }
          offset[0] = 0;
          for (let b = 1; b < 16; b++) {
            offset[b] = offset[b - 1] + count[b - 1];
          }
          for (let i = 0; i < n; i++) {
            const k = curK[i];
            const v = curV[i];
            const b = (k >>> shift) & 0xf;
            const dst = offset[b]++;
            nextK[dst] = k;
            nextV[dst] = v;
          }
          const tk = curK;
          curK = nextK;
          nextK = tk;
          const tv = curV;
          curV = nextV;
          nextV = tv;
        }
        return { keys: curK, values: curV };
      }

      const testSizes = [1, 7, 64, 256, 1024, 2048, 5000, 16384, 65536];
      const gpuPrefixSum = new GpuPrefixSum(device, 65536);
      const gpuRadixSort = new GpuRadixSort(device, 65536);

      // 10 種の乱数シードで検証
      for (let s = 1; s <= 10; s++) {
        const rng = makeRng(s * 10007);
        const size = testSizes[s % testSizes.length];

        const hostInput = new Uint32Array(size);
        const hostKeys = new Uint32Array(size);
        const hostVals = new Uint32Array(size);
        for (let i = 0; i < size; i++) {
          hostInput[i] = (rng() % 100) >>> 0;
          hostKeys[i] = rng();
          hostVals[i] = i;
        }

        // 1. Prefix Sum 検証
        const inBuf = device.createBuffer({
          sizeBytes: size * 4,
          usage: BufferUsage.Storage | BufferUsage.CopyDst,
        });
        const outBuf = device.createBuffer({
          sizeBytes: size * 4,
          usage: BufferUsage.Storage | BufferUsage.CopySrc,
        });
        device.writeBuffer(inBuf, 0, hostInput);

        const bgScan = gpuPrefixSum.createBindGroup({ inputBuffer: inBuf, outputBuffer: outBuf });
        const encScan = device.createCommandEncoder();
        gpuPrefixSum.execute(encScan, bgScan, size);
        device.submit(encScan);

        const expectedScan = cpuPrefixSum(hostInput);
        const actualScanBuf = await device.readBufferAsync(outBuf, 0, size * 4);
        const actualScan = new Uint32Array(actualScanBuf);

        for (let i = 0; i < size; i++) {
          if (actualScan[i] !== expectedScan[i]) {
            device.destroy();
            return {
              skipped: false,
              passed: false,
              error: `PrefixSum 不一致 (seed=${String(s)}, size=${String(size)}, index=${String(i)}, actual=${String(actualScan[i])}, expected=${String(expectedScan[i])})`,
            };
          }
        }

        // 2. Radix Sort 検証
        const kBuf = device.createBuffer({
          sizeBytes: size * 4,
          usage: BufferUsage.Storage | BufferUsage.CopyDst | BufferUsage.CopySrc,
        });
        const vBuf = device.createBuffer({
          sizeBytes: size * 4,
          usage: BufferUsage.Storage | BufferUsage.CopyDst | BufferUsage.CopySrc,
        });
        const skBuf = device.createBuffer({
          sizeBytes: size * 4,
          usage: BufferUsage.Storage | BufferUsage.CopyDst,
        });
        const svBuf = device.createBuffer({
          sizeBytes: size * 4,
          usage: BufferUsage.Storage | BufferUsage.CopyDst,
        });
        device.writeBuffer(kBuf, 0, hostKeys);
        device.writeBuffer(vBuf, 0, hostVals);

        const bgsSort = gpuRadixSort.createBindGroups({
          keys: kBuf,
          values: vBuf,
          scratchKeys: skBuf,
          scratchValues: svBuf,
        });
        const encSort = device.createCommandEncoder();
        gpuRadixSort.execute(encSort, bgsSort, size);
        device.submit(encSort);

        const expectedSort = cpuRadixSort(hostKeys, hostVals);
        const actualKeysBuf = await device.readBufferAsync(kBuf, 0, size * 4);
        const actualValsBuf = await device.readBufferAsync(vBuf, 0, size * 4);
        const actualKeys = new Uint32Array(actualKeysBuf);
        const actualVals = new Uint32Array(actualValsBuf);

        for (let i = 0; i < size; i++) {
          if (actualKeys[i] !== expectedSort.keys[i] || actualVals[i] !== expectedSort.values[i]) {
            device.destroy();
            return {
              skipped: false,
              passed: false,
              error: `RadixSort 不一致 (seed=${String(s)}, size=${String(size)}, index=${String(i)})`,
            };
          }
        }

        inBuf.destroy();
        outBuf.destroy();
        kBuf.destroy();
        vBuf.destroy();
        skBuf.destroy();
        svBuf.destroy();
      }

      device.destroy();
      return { skipped: false, passed: true };
    }, plutoBackend);

    expect(result.passed).toBe(true);
  });
});
