import { afterEach, describe, expect, it, vi } from "vitest";

import { TranscodeUsdToDocumentAsync } from "../../src/Blocks/tinyUsdzTranscoder";

const TinyUsdzModuleFactory = vi.hoisted(() => vi.fn());

vi.mock("tinyusdz/tinyusdz.js", () => ({
    default: TinyUsdzModuleFactory,
}));

function CreateNativeStage(overrides: Record<string, unknown> = {}) {
    return {
        loadFromBinary: vi.fn(() => true),
        error: vi.fn(() => "parse failed"),
        getSceneMetadata: vi.fn(() => ({ upAxis: "Y", metersPerUnit: 1 })),
        numRootNodes: vi.fn(() => 0),
        getRootNode: vi.fn(),
        getMesh: vi.fn(),
        getMaterial: vi.fn(),
        numTextures: vi.fn(() => 0),
        numLights: vi.fn(() => 0),
        numCameras: vi.fn(() => 0),
        numSkeletons: vi.fn(() => 0),
        numAnimations: vi.fn(() => 0),
        numInstances: vi.fn(() => 0),
        delete: vi.fn(),
        ...overrides,
    };
}

function UseNativeStages(...stages: ReturnType<typeof CreateNativeStage>[]): void {
    TinyUsdzModuleFactory.mockImplementation(async () => {
        const NativeStage = vi.fn(function () {
            const stage = stages.shift();
            if (!stage) {
                throw new Error("No mock TinyUSDZLoaderNative stage remains.");
            }
            return stage;
        });
        return { TinyUSDZLoaderNative: NativeStage };
    });
}

afterEach(() => {
    vi.resetAllMocks();
});

describe("TinyUSDZLoaderNative lifetime", () => {
    it("deletes the native stage exactly once after a successful conversion", async () => {
        const stage = CreateNativeStage();
        UseNativeStages(stage);

        await expect(TranscodeUsdToDocumentAsync(new TextEncoder().encode("#usda 1.0"), { sourceFormat: "usda" })).resolves.toBeDefined();

        expect(stage.delete).toHaveBeenCalledTimes(1);
    });

    it("deletes the native stage exactly once when parsing fails", async () => {
        const stage = CreateNativeStage({ loadFromBinary: vi.fn(() => false) });
        UseNativeStages(stage);

        await expect(TranscodeUsdToDocumentAsync(new Uint8Array([1]), { sourceFormat: "usd" })).rejects.toThrow(/parse failed/);

        expect(stage.delete).toHaveBeenCalledTimes(1);
    });

    it("deletes the native stage exactly once when conversion fails", async () => {
        const stage = CreateNativeStage({
            getSceneMetadata: vi.fn(() => {
                throw new Error("conversion failed");
            }),
        });
        UseNativeStages(stage);

        await expect(TranscodeUsdToDocumentAsync(new TextEncoder().encode("#usda 1.0"), { sourceFormat: "usda" })).rejects.toThrow(/conversion failed/);

        expect(stage.delete).toHaveBeenCalledTimes(1);
    });

    it("deletes each native stage exactly once across repeated worker-style conversions", async () => {
        const firstStage = CreateNativeStage();
        const secondStage = CreateNativeStage();
        UseNativeStages(firstStage, secondStage);

        await TranscodeUsdToDocumentAsync(new TextEncoder().encode("#usda 1.0"), { sourceFormat: "usda" });
        await TranscodeUsdToDocumentAsync(new TextEncoder().encode("#usda 1.0"), { sourceFormat: "usda" });

        expect(firstStage.delete).toHaveBeenCalledTimes(1);
        expect(secondStage.delete).toHaveBeenCalledTimes(1);
    });
});
