/**
 * @file RHI コンピュートと間接描画のブラウザテスト (docs/06-rhi.md §4、docs/12-roadmap.md T-3.4)。
 * WebGPU の compute (配列 2 倍) と readBufferAsync、drawIndirect を検証する。
 * WebGL2 では caps.compute === false および非対応時の例外送出を検証する (test.skip は不使用)。
 */
import { expect, test } from '../helpers/harness-test';

test.describe('RHI コンピュートと間接描画 (T-3.4)', () => {
  test('コンピュートパイプラインで配列を 2 倍にし readBufferAsync で検証', async ({
    page,
    plutoBackend,
  }) => {
    await page.goto(`/tests/browser/fixtures/harness.html?backend=${plutoBackend}&build=src`);

    const result = await page.evaluate(async (backend) => {
      const { createDevice, BufferUsage, BindingType, ShaderStage } =
        await import('../../../src/rhi');
      const { ErrorCode, PlutoError } = await import('../../../src/core/debug');
      const canvas = document.getElementById('pluto-canvas') as HTMLCanvasElement;
      const device = await createDevice({ canvas, backend });

      if (device.caps.compute) {
        // WebGPU: 配列を 2 倍にする compute
        const count = 8;
        const sizeBytes = count * 4;

        const storageBuf = device.createBuffer({
          sizeBytes,
          usage: BufferUsage.Storage | BufferUsage.CopySrc | BufferUsage.CopyDst,
        });
        const stagingBuf = device.createBuffer({
          sizeBytes,
          usage: BufferUsage.MapRead | BufferUsage.CopyDst,
        });

        const initialData = new Uint32Array([1, 2, 3, 4, 5, 6, 7, 8]);
        device.writeBuffer(storageBuf, 0, initialData);

        const layout = device.createBindGroupLayout({
          entries: [
            {
              stage: ShaderStage.Compute,
              type: BindingType.StorageBufferReadWrite,
            },
          ],
        });

        const bindGroup = device.createBindGroup({
          layout,
          entries: [
            {
              type: BindingType.StorageBufferReadWrite,
              buffer: storageBuf,
            },
          ],
        });

        const pipeline = device.createComputePipeline({
          computeShader: {
            name: 'double-array',
            wgsl: `
              @group(0) @binding(0) var<storage, read_write> data: array<u32>;
              @compute @workgroup_size(8)
              fn cs_main(@builtin(global_invocation_id) id: vec3<u32>) {
                data[id.x] = data[id.x] * 2u;
              }
            `,
          },
          layouts: [layout],
          workgroupSize: [8, 1, 1],
        });

        const encoder = device.createCommandEncoder();
        const pass = encoder.beginComputePass();
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bindGroup);
        pass.dispatch(1, 1, 1);
        pass.end();

        encoder.copyBufferToBuffer(storageBuf, 0, stagingBuf, 0, sizeBytes);
        device.submit(encoder);

        const readData = await device.readBufferAsync(stagingBuf, 0, sizeBytes);
        const out = Array.from(new Uint32Array(readData));

        storageBuf.destroy();
        stagingBuf.destroy();
        layout.destroy();
        bindGroup.destroy();
        pipeline.destroy();
        device.destroy();

        return { backend: 'webgpu', out };
      } else {
        // WebGL2: compute 非対応の検証
        let caught: unknown;
        try {
          device.createComputePipeline({
            computeShader: { name: 'unsupported', wgsl: '' },
            layouts: [],
            workgroupSize: [1, 1, 1],
          });
        } catch (err) {
          caught = err;
        }

        const isUnsupported =
          caught instanceof PlutoError && caught.code === ErrorCode.UnsupportedFeature;
        device.destroy();
        return { backend: 'webgl2', isUnsupported };
      }
    }, plutoBackend);

    if (plutoBackend === 'webgpu') {
      expect(result.backend).toBe('webgpu');
      expect(result.out).toEqual([2, 4, 6, 8, 10, 12, 14, 16]);
    } else {
      expect(result.backend).toBe('webgl2');
      expect(result.isUnsupported).toBe(true);
    }
  });

  test('間接描画 drawIndirect の動作を検証', async ({ page, plutoBackend }) => {
    await page.goto(`/tests/browser/fixtures/harness.html?backend=${plutoBackend}&build=src`);

    const result = await page.evaluate(async (backend) => {
      const { createDevice, BufferUsage, LoadAction, BlendMode, SWAPCHAIN_FORMAT } =
        await import('../../../src/rhi');
      const { ErrorCode, PlutoError } = await import('../../../src/core/debug');
      const canvas = document.getElementById('pluto-canvas') as HTMLCanvasElement;
      const device = await createDevice({ canvas, backend });

      if (device.caps.indirectDraw) {
        // WebGPU: 間接描画バッファ (vertexCount, instanceCount, firstVertex, firstInstance)
        const indirectBuffer = device.createBuffer({
          sizeBytes: 16,
          usage: BufferUsage.Indirect | BufferUsage.CopyDst,
        });
        // 6 頂点、1 インスタンス
        device.writeBuffer(indirectBuffer, 0, new Uint32Array([6, 1, 0, 0]));

        const shader = {
          name: 'rhi-indirect',
          wgsl: `
            @vertex
            fn vs_main(@builtin(vertex_index) vertex_index: u32) -> @builtin(position) vec4<f32> {
              var pos = array<vec2<f32>, 6>(
                vec2<f32>(-0.2, -0.2), vec2<f32>( 0.2, -0.2), vec2<f32>(-0.2,  0.2),
                vec2<f32>(-0.2,  0.2), vec2<f32>( 0.2, -0.2), vec2<f32>( 0.2,  0.2)
              );
              return vec4<f32>(pos[vertex_index], 0.0, 1.0);
            }
            @fragment
            fn fs_main() -> @location(0) vec4<f32> {
              return vec4<f32>(1.0, 0.0, 0.0, 1.0);
            }
          `,
        };

        const pipeline = device.createRenderPipeline({
          vertexShader: shader,
          fragmentShader: shader,
          layouts: [],
          colorTargets: [
            {
              format: SWAPCHAIN_FORMAT,
              blend: BlendMode.Opaque,
            },
          ],
        });

        const currentTex = device.getCurrentTexture();
        const encoder = device.createCommandEncoder();
        const pass = encoder.beginRenderPass({
          colorAttachments: [
            {
              view: currentTex,
              load: LoadAction.Clear,
              store: true,
              clearColor: [0.0, 0.0, 0.0, 1.0],
            },
          ],
        });
        pass.setPipeline(pipeline);
        pass.setViewport(0, 0, 256, 256);
        pass.drawIndirect(indirectBuffer, 0);
        pass.end();
        device.submit(encoder);

        indirectBuffer.destroy();
        pipeline.destroy();
        device.destroy();

        return { backend: 'webgpu', indirectSuccess: true };
      } else {
        // WebGL2: 間接描画は非対応で例外
        const dummyBuf = device.createBuffer({
          sizeBytes: 16,
          usage: BufferUsage.Uniform,
        });

        const currentTex = device.getCurrentTexture();
        const encoder = device.createCommandEncoder();
        const pass = encoder.beginRenderPass({
          colorAttachments: [
            {
              view: currentTex,
              load: LoadAction.Clear,
              store: true,
              clearColor: [0.0, 0.0, 0.0, 1.0],
            },
          ],
        });

        let caught: unknown;
        try {
          pass.drawIndirect(dummyBuf, 0);
        } catch (err) {
          caught = err;
        }

        pass.end();
        device.submit(encoder);
        dummyBuf.destroy();
        device.destroy();

        const isInvalidState =
          caught instanceof PlutoError && caught.code === ErrorCode.InvalidState;
        return { backend: 'webgl2', isInvalidState };
      }
    }, plutoBackend);

    if (plutoBackend === 'webgpu') {
      expect(result.indirectSuccess).toBe(true);
    } else {
      expect(result.isInvalidState).toBe(true);
    }
  });
});
