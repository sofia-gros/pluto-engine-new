// フレームテーブル構造体 (docs/07-renderer.md §4)
// 32 バイト / フレーム

#ifndef FRAME_WGSL
#define FRAME_WGSL

struct FrameData {
    uvMinX: f32,
    uvMinY: f32,
    uvMaxX: f32,
    uvMaxY: f32,
    size: u32,       // low: width (f16), high: height (f16)
    anchor: u32,     // low: anchorX (f16), high: anchorY (f16)
    page: u32,       // bit 0..15: page, bit 16: FRAME_PAGE_COMPRESSED_BIT
    reserved: u32,
};

fn frameGetUvMin(f: FrameData) -> vec2<f32> {
    return vec2<f32>(f.uvMinX, f.uvMinY);
}

fn frameGetUvMax(f: FrameData) -> vec2<f32> {
    return vec2<f32>(f.uvMaxX, f.uvMaxY);
}

fn frameGetSize(f: FrameData) -> vec2<f32> {
    return unpack2x16float(f.size);
}

fn frameGetAnchor(f: FrameData) -> vec2<f32> {
    return unpack2x16float(f.anchor);
}

fn frameGetPage(f: FrameData) -> u32 {
    return f.page & 0xffffu;
}

fn frameIsCompressed(f: FrameData) -> bool {
    return (f.page & 0x10000u) != 0u;
}

#endif
