import { describe, expect, it } from "vitest";

import { IsBase64DataUrl, TestBase64DataUrl } from "core/Misc/fileTools.pure";

describe("Base64 data URLs", () => {
    it("accepts the empty-media valid form", () => {
        expect(IsBase64DataUrl("data:;base64,AA==")).toBe(true);
        expect(TestBase64DataUrl("data:;base64,AA==")).toEqual({ match: true, type: "" });
    });

    it("accepts a normal MIME type", () => {
        expect(IsBase64DataUrl("data:image/png;base64,AA==")).toBe(true);
        expect(TestBase64DataUrl("data:image/png;base64,AA==")).toEqual({ match: true, type: "image/png" });
    });

    it("accepts MIME parameters", () => {
        expect(IsBase64DataUrl("data:text/plain;charset=utf-8;base64,AA==")).toBe(true);
        expect(TestBase64DataUrl("data:text/plain;charset=utf-8;base64,AA==")).toEqual({ match: true, type: "text/plain;charset=utf-8" });
    });

    it("preserves case-insensitive matching and the existing type extraction behavior", () => {
        const mixedCase = "data:IMAGE/PNG;BaSe64,AA==";

        expect(IsBase64DataUrl(mixedCase)).toBe(true);
        expect(TestBase64DataUrl(mixedCase)).toEqual({ match: true, type: "IMAGE/PNG;BaSe64," });
    });

    it("rejects non-base64 and malformed media URLs", () => {
        for (const uri of ["data:text/plain,hello", "data:textplain;base64,AA==", "data:/plain;base64,AA==", "data:text/plain;base64"]) {
            expect(IsBase64DataUrl(uri)).toBe(false);
            expect(TestBase64DataUrl(uri)).toEqual({ match: false, type: "" });
        }
    });

    it("rejects a large raw OBJ-like data URL without a comma promptly", () => {
        const rawObjDataUrl = "data:" + "v 0 0 0\n".repeat(100_000);
        const startedAt = performance.now();

        expect(IsBase64DataUrl(rawObjDataUrl)).toBe(false);
        expect(TestBase64DataUrl(rawObjDataUrl)).toEqual({ match: false, type: "" });
        expect(performance.now() - startedAt).toBeLessThan(1_000);
    });
});
