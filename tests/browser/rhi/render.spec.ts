/**
 * @file RHI 描画系のブラウザテスト (docs/06-rhi.md §4・§7、docs/12-roadmap.md T-3.4)。
 * クリアカラー、vertex pulling 四角形描画 (ゴールデン画像)、ストレージ読み取り四角形描画を検証する。
 */
import { expect, test } from '../helpers/harness-test';
import { expectGolden } from '../helpers/golden';

test.describe('RHI 描画パイプライン (T-3.4)', () => {
  test('クリアカラーでレンダーパスを実行できる', async ({ page, plutoBackend }) => {
    await page.goto(`/tests/browser/fixtures/harness.html?backend=${plutoBackend}&build=src`);

    const isCleared = await page.evaluate(async (backend) => {
      const { createDevice, LoadAction } = await import('../../../src/rhi');
      const canvas = document.getElementById('pluto-canvas') as HTMLCanvasElement;
      const device = await createDevice({ canvas, backend });

      const currentTex = device.getCurrentTexture();
      const encoder = device.createCommandEncoder();
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: currentTex,
            load: LoadAction.Clear,
            store: true,
            clearColor: [0.2, 0.5, 0.8, 1.0],
          },
        ],
      });
      pass.end();
      device.submit(encoder);
      device.destroy();
      return true;
    }, plutoBackend);

    expect(isCleared).toBe(true);
  });

  test('vertex pulling による 1 つの四角形描画 (ゴールデン画像)', async ({
    page,
    plutoBackend,
  }) => {
    await page.goto(`/tests/browser/fixtures/harness.html?backend=${plutoBackend}&build=src`);

    await page.evaluate(async (backend) => {
      const { createDevice, LoadAction, BlendMode, SWAPCHAIN_FORMAT } =
        await import('../../../src/rhi');
      const canvas = document.getElementById('pluto-canvas') as HTMLCanvasElement;
      const device = await createDevice({ canvas, backend });

      const shader = {
        name: 'rhi-quad',
        wgsl: `
          struct VertexOutput {
            @builtin(position) position: vec4<f32>,
            @location(0) color: vec4<f32>,
          };
          @vertex
          fn vs_main(@builtin(vertex_index) vertex_index: u32) -> VertexOutput {
            var pos = array<vec2<f32>, 6>(
              vec2<f32>(-0.5, -0.5),
              vec2<f32>( 0.5, -0.5),
              vec2<f32>(-0.5,  0.5),
              vec2<f32>(-0.5,  0.5),
              vec2<f32>( 0.5, -0.5),
              vec2<f32>( 0.5,  0.5)
            );
            var out: VertexOutput;
            out.position = vec4<f32>(pos[vertex_index], 0.0, 1.0);
            out.color = vec4<f32>(0.2, 0.7, 0.3, 1.0);
            return out;
          }
          @fragment
          fn fs_main(@location(0) color: vec4<f32>) -> @location(0) vec4<f32> {
            return color;
          }
        `,
        glslVertex: `#version 300 es
          precision highp float; precision highp int;
          out vec4 v_color;
          void main() {
            vec2 pos[6] = vec2[6](
              vec2(-0.5, -0.5),
              vec2( 0.5, -0.5),
              vec2(-0.5,  0.5),
              vec2(-0.5,  0.5),
              vec2( 0.5, -0.5),
              vec2( 0.5,  0.5)
            );
            gl_Position = vec4(pos[gl_VertexID], 0.0, 1.0);
            v_color = vec4(0.2, 0.7, 0.3, 1.0);
          }
        `,
        glslFragment: `#version 300 es
          precision highp float; precision highp int;
          in vec4 v_color;
          out vec4 fragColor;
          void main() {
            fragColor = v_color;
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
      pass.draw(6, 1);
      pass.end();
      device.submit(encoder);
    }, plutoBackend);

    await expectGolden(page, 'rhi-quad');
  });

  test('ストレージ (WebGL2 はデータテクスチャ) から色を読む四角形描画', async ({
    page,
    plutoBackend,
  }) => {
    await page.goto(`/tests/browser/fixtures/harness.html?backend=${plutoBackend}&build=src`);

    const isRendered = await page.evaluate(async (backend) => {
      const {
        createDevice,
        BufferUsage,
        BindingType,
        ShaderStage,
        LoadAction,
        BlendMode,
        SWAPCHAIN_FORMAT,
      } = await import('../../../src/rhi');
      const canvas = document.getElementById('pluto-canvas') as HTMLCanvasElement;
      const device = await createDevice({ canvas, backend });

      // 色データを格納するストレージバッファ
      // 1 texel = 16 bytes = 4 floats: [0.8, 0.1, 0.3, 1.0]
      const colorBuffer = device.createBuffer({
        sizeBytes: 16,
        usage: BufferUsage.Storage | BufferUsage.CopyDst,
      });
      const colorData = new Float32Array([0.8, 0.1, 0.3, 1.0]);
      device.writeBuffer(colorBuffer, 0, colorData);

      const layout = device.createBindGroupLayout({
        entries: [
          {
            stage: ShaderStage.Fragment,
            type: BindingType.StorageBufferRead,
          },
        ],
      });

      const bindGroup = device.createBindGroup({
        layout,
        entries: [
          {
            type: BindingType.StorageBufferRead,
            buffer: colorBuffer,
          },
        ],
      });

      const shader = {
        name: 'rhi-storage-color',
        wgsl: `
          struct VertexOutput {
            @builtin(position) position: vec4<f32>,
          };
          @vertex
          fn vs_main(@builtin(vertex_index) vertex_index: u32) -> VertexOutput {
            var pos = array<vec2<f32>, 6>(
              vec2<f32>(-0.5, -0.5),
              vec2<f32>( 0.5, -0.5),
              vec2<f32>(-0.5,  0.5),
              vec2<f32>(-0.5,  0.5),
              vec2<f32>( 0.5, -0.5),
              vec2<f32>( 0.5,  0.5)
            );
            var out: VertexOutput;
            out.position = vec4<f32>(pos[vertex_index], 0.0, 1.0);
            return out;
          }

          @group(0) @binding(0) var<storage, read> colors: array<vec4<f32>>;

          @fragment
          fn fs_main() -> @location(0) vec4<f32> {
            return colors[0];
          }
        `,
        glslVertex: `#version 300 es
          precision highp float; precision highp int;
          void main() {
            vec2 pos[6] = vec2[6](
              vec2(-0.5, -0.5),
              vec2( 0.5, -0.5),
              vec2(-0.5,  0.5),
              vec2(-0.5,  0.5),
              vec2( 0.5, -0.5),
              vec2( 0.5,  0.5)
            );
            gl_Position = vec4(pos[gl_VertexID], 0.0, 1.0);
          }
        `,
        glslFragment: `#version 300 es
          precision highp float; precision highp int;
          uniform highp usampler2D colors;
          out vec4 fragColor;
          void main() {
            uvec4 raw = texelFetch(colors, ivec2(0, 0), 0);
            fragColor = vec4(uintBitsToFloat(raw.x), uintBitsToFloat(raw.y), uintBitsToFloat(raw.z), uintBitsToFloat(raw.w));
          }
        `,
      };

      const pipeline = device.createRenderPipeline({
        vertexShader: shader,
        fragmentShader: shader,
        layouts: [layout],
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
      pass.setBindGroup(0, bindGroup);
      pass.setViewport(0, 0, 256, 256);
      pass.draw(6, 1);
      pass.end();
      device.submit(encoder);

      colorBuffer.destroy();
      layout.destroy();
      bindGroup.destroy();
      pipeline.destroy();
      device.destroy();

      return true;
    }, plutoBackend);

    expect(isRendered).toBe(true);
  });
});
