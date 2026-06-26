import { describe, expect, it } from "vitest";
import { DecodeLz4Block } from "loaders/USD/resolution/parser/crate/crateLz4";

const EncodeAscii = (value: string): number[] => Array.from(new TextEncoder().encode(value));
const DecodeAscii = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

describe("USDC crate LZ4 block decoder", () => {
    it("decodes a literal-only block", () => {
        const compressed = new Uint8Array([0x50, ...EncodeAscii("hello")]);

        expect(DecodeAscii(DecodeLz4Block(compressed, 5))).toBe("hello");
    });

    it("decodes an overlapping back-reference match", () => {
        const compressed = new Uint8Array([0x35, ...EncodeAscii("abc"), 0x03, 0x00, 0x30, ...EncodeAscii("XYZ")]);

        expect(DecodeAscii(DecodeLz4Block(compressed, 15))).toBe("abcabcabcabcXYZ");
    });

    it("rejects invalid match offsets", () => {
        const compressed = new Uint8Array([0x01, 0x00, 0x00]);

        expect(() => DecodeLz4Block(compressed, 4)).toThrow("invalid LZ4 match offset");
    });
});
