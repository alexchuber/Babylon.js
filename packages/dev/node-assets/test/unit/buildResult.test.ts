import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";

import { CreateNodeAssetBuildResult } from "../../src/evaluation/buildScope";

describe("NodeAsset build result", () => {
    it("retains fresh extensible terminal byte identity", () => {
        const bytes = new Uint8Array([1, 2, 3]);

        const result = CreateNodeAssetBuildResult(bytes, [], []);

        expect(result).toBe(bytes);
        expect(result.diagnostics).toEqual([]);
        expect(result.lossRecords).toEqual([]);
    });

    it("copies non-extensible terminal bytes before attaching metadata", () => {
        const bytes = Object.preventExtensions(new Uint8Array([4, 5, 6]));

        const result = CreateNodeAssetBuildResult(bytes, [], []);

        expect(result).not.toBe(bytes);
        expect(result).toEqual(new Uint8Array([4, 5, 6]));
        expect(result.diagnostics).toEqual([]);
        expect(result.lossRecords).toEqual([]);
    });

    it("copies reused Buffer bytes without retaining their shared backing storage or metadata", () => {
        const bytes = Buffer.from([7, 8, 9]);
        const first = CreateNodeAssetBuildResult(bytes, [{ code: "FIRST", severity: "info", message: "first" }], []);

        const second = CreateNodeAssetBuildResult(first, [{ code: "SECOND", severity: "info", message: "second" }], []);
        bytes[0] = 99;

        expect(first).toBe(bytes);
        expect(second).not.toBe(bytes);
        expect(second).toEqual(new Uint8Array([7, 8, 9]));
        expect(first.diagnostics).toMatchObject([{ code: "FIRST" }]);
        expect(second.diagnostics).toMatchObject([{ code: "SECOND" }]);
    });
});
