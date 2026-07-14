import { describe, expect, it } from "vitest";

import { DetectPreviewPayload } from "../../src/nodeAssets/previewPayload";

// Real file-format signatures. The sniff only reads the leading magic bytes, so a signature plus a
// short tail of arbitrary payload is enough to exercise every branch.
const GlbBytes = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 0x02, 0x00, 0x00, 0x00, 0x10, 0x00, 0x00, 0x00]); // "glTF" + version 2 + length
const PngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
const JpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const WebpBytes = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]); // "RIFF" + size + "WEBP"
const Gif87aBytes = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x37, 0x61]);
const Gif89aBytes = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
const BmpBytes = new Uint8Array([0x42, 0x4d, 0x46, 0x00, 0x00, 0x00]);

describe("DetectPreviewPayload", () => {
    it("classifies glb (glTF magic) as a scene payload", () => {
        expect(DetectPreviewPayload(GlbBytes)).toEqual({ kind: "scene", mimeType: null });
    });

    it("classifies a PNG signature as an image/png payload", () => {
        expect(DetectPreviewPayload(PngBytes)).toEqual({ kind: "image", mimeType: "image/png" });
    });

    it("classifies a JPEG signature as an image/jpeg payload", () => {
        expect(DetectPreviewPayload(JpegBytes)).toEqual({ kind: "image", mimeType: "image/jpeg" });
    });

    it("classifies a RIFF/WEBP signature as an image/webp payload", () => {
        expect(DetectPreviewPayload(WebpBytes)).toEqual({ kind: "image", mimeType: "image/webp" });
    });

    it.each([
        ["GIF87a", Gif87aBytes],
        ["GIF89a", Gif89aBytes],
    ])("classifies a %s signature as an image/gif payload", (_name, bytes) => {
        expect(DetectPreviewPayload(bytes)).toEqual({ kind: "image", mimeType: "image/gif" });
    });

    it("classifies a BMP signature as an image/bmp payload", () => {
        expect(DetectPreviewPayload(BmpBytes)).toEqual({ kind: "image", mimeType: "image/bmp" });
    });

    it("treats a RIFF container that is not WEBP (e.g. WAV) as a scene payload", () => {
        // "RIFF" + size + "WAVE": a RIFF header alone must not be mistaken for an image.
        const waveBytes = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45]);
        expect(DetectPreviewPayload(waveBytes)).toEqual({ kind: "scene", mimeType: null });
    });

    it("defaults unknown or truncated bytes to a scene payload so the glb path is unchanged", () => {
        expect(DetectPreviewPayload(new Uint8Array([]))).toEqual({ kind: "scene", mimeType: null });
        expect(DetectPreviewPayload(new Uint8Array([0x89, 0x50]))).toEqual({ kind: "scene", mimeType: null });
        expect(DetectPreviewPayload(new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05, 0x06]))).toEqual({ kind: "scene", mimeType: null });
    });
});
