import { describe, expect, it } from 'vitest';
import type { RhiCapabilities } from '../../../src/rhi/capabilities';

/** docs/06 §3 に列挙されたプロパティ名。実装から消えていないかの基準にする。 */
const DOCUMENTED_KEYS = [
  'backend',
  'compute',
  'indirectDraw',
  'storageBuffers',
  'timestampQuery',
  'floatRenderTarget',
  'floatBlend',
  'maxTextureSize',
  'maxTextureArrayLayers',
  'maxStorageBufferBytes',
  'maxComputeWorkgroupSize',
  'maxComputeInvocationsPerWorkgroup',
  'minUniformBufferOffsetAlignment',
  'minStorageBufferOffsetAlignment',
  'textureCompressionBC7',
  'textureCompressionETC2',
  'textureCompressionASTC',
] as const;

/** docs/06 §3 の「WebGPU / WebGL2」の Capability 表をそのまま写した値。 */
const WEBGPU: RhiCapabilities = {
  backend: 'webgpu',
  compute: true,
  indirectDraw: true,
  storageBuffers: true,
  timestampQuery: true,
  floatRenderTarget: true,
  floatBlend: true,
  maxTextureSize: 8192,
  maxTextureArrayLayers: 256,
  maxStorageBufferBytes: 134217728,
  maxComputeWorkgroupSize: 256,
  maxComputeInvocationsPerWorkgroup: 256,
  minUniformBufferOffsetAlignment: 256,
  minStorageBufferOffsetAlignment: 256,
  textureCompressionBC7: true,
  textureCompressionETC2: true,
  textureCompressionASTC: true,
};

/** docs/06 §3 に従った WebGL2 の Capability。compute と indirect は false。 */
const WEBGL2: RhiCapabilities = {
  backend: 'webgl2',
  compute: false,
  indirectDraw: false,
  storageBuffers: true,
  timestampQuery: false,
  floatRenderTarget: true,
  floatBlend: true,
  maxTextureSize: 8192,
  maxTextureArrayLayers: 256,
  maxStorageBufferBytes: 67108864,
  maxComputeWorkgroupSize: 0,
  maxComputeInvocationsPerWorkgroup: 0,
  minUniformBufferOffsetAlignment: 256,
  minStorageBufferOffsetAlignment: 256,
  textureCompressionBC7: true,
  textureCompressionETC2: true,
  textureCompressionASTC: false,
};

describe('rhi 能力', () => {
  it('WebGPU は compute と indirectDraw が true (docs/06 §3)', () => {
    expect(WEBGPU.backend).toBe('webgpu');
    expect(WEBGPU.compute).toBe(true);
    expect(WEBGPU.indirectDraw).toBe(true);
    expect(WEBGPU.maxComputeWorkgroupSize).toBeGreaterThan(0);
  });

  it('WebGL2 は compute と indirectDraw が false、maxComputeWorkgroupSize が 0 (docs/06 §3)', () => {
    expect(WEBGL2.backend).toBe('webgl2');
    expect(WEBGL2.compute).toBe(false);
    expect(WEBGL2.indirectDraw).toBe(false);
    expect(WEBGL2.maxComputeWorkgroupSize).toBe(0);
  });

  it('WebGL2 は timestampQuery が false なので createQuerySet が null を返す前提になる', () => {
    expect(WEBGPU.timestampQuery).toBe(true);
    expect(WEBGL2.timestampQuery).toBe(false);
  });

  it('プロパティ名は docs/06 §3 の 17 個とちょうど一致する', () => {
    expect(Object.keys(WEBGPU).sort()).toEqual([...DOCUMENTED_KEYS].sort());
    expect(Object.keys(WEBGL2).sort()).toEqual([...DOCUMENTED_KEYS].sort());
  });
});
