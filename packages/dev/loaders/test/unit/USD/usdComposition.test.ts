import { describe, expect, it } from "vitest";

import { type IUsdLayerSource } from "loaders/USD/resolution/layerSource";
import { type IResolvedPrim } from "loaders/USD/resolution/resolvedStage";
import { ResolveUsdStageAsync } from "loaders/USD/resolution/usdResolver";

function createLayerSource(layers: ReadonlyMap<string, string>, onRequest?: (identifier: string) => void): IUsdLayerSource {
    return {
        loadLayerAsync: async (identifier) => {
            onRequest?.(identifier);
            return layers.get(identifier);
        },
    };
}

function findPrim(root: IResolvedPrim, path: string): IResolvedPrim | undefined {
    const pending = [...root.children];
    while (pending.length > 0) {
        const prim = pending.pop()!;
        if (prim.path === path) {
            return prim;
        }
        pending.push(...prim.children);
    }
    return undefined;
}

const wrapperUsda = `#usda 1.0
(
    defaultPrim = "Wrapper"
    metersPerUnit = 1
    upAxis = "Y"
)
def Xform "Wrapper" (
    prepend references = @./nested/child.usda@</Asset>
)
{
    double3 xformOp:translate = (1, 2, 3)
    uniform token[] xformOpOrder = ["xformOp:translate"]
}
`;

const childUsda = `#usda 1.0
(
    defaultPrim = "Asset"
    metersPerUnit = 0.01
    upAxis = "Z"
)
def Xform "Asset"
{
    def Xform "Part"
    {
        double3 xformOp:translate = (4, 5, 6)
        uniform token[] xformOpOrder = ["xformOp:translate"]
    }
}
`;

describe("USD authored reference composition", () => {
    it("resolves a relative prepend reference and grafts the referenced hierarchy beneath the wrapper", async () => {
        const requestedIdentifiers: string[] = [];
        const stage = await ResolveUsdStageAsync(wrapperUsda, "https://example.test/Assets/", "Wrapper.usda", {
            layerSource: createLayerSource(new Map([["https://example.test/Assets/nested/child.usda", childUsda]]), (identifier) => requestedIdentifiers.push(identifier)),
        });

        expect(requestedIdentifiers).toEqual(["https://example.test/Assets/nested/child.usda"]);
        expect(stage.metadata.upAxis).toBe("Z");
        expect(stage.metadata.metersPerUnit).toBe(0.01);

        const wrapper = findPrim(stage.root, "/Wrapper");
        const part = findPrim(stage.root, "/Wrapper/Part");
        expect(wrapper).toBeDefined();
        expect(part).toBeDefined();
        expect(wrapper!.transform.translation).toEqual([1, 2, 3]);
        expect(part!.transform.translation).toEqual([4, 5, 6]);
        expect(stage.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
    });

    it("reports missing layers as a typed failure", async () => {
        await expect(
            ResolveUsdStageAsync(wrapperUsda, "https://example.test/Assets/", "Wrapper.usda", {
                layerSource: createLayerSource(new Map()),
            })
        ).rejects.toMatchObject({
            name: "UsdLayerLoadError",
            kind: "missing-layer",
            identifier: "https://example.test/Assets/nested/child.usda",
        });
    });

    it("reports fetch failures as a typed failure", async () => {
        const layerSource: IUsdLayerSource = {
            loadLayerAsync: async () => {
                throw new Error("network unavailable");
            },
        };

        await expect(ResolveUsdStageAsync(wrapperUsda, "https://example.test/Assets/", "Wrapper.usda", { layerSource })).rejects.toMatchObject({
            name: "UsdLayerLoadError",
            kind: "fetch-failed",
            identifier: "https://example.test/Assets/nested/child.usda",
        });
    });

    it("reports reference cycles as a typed failure", async () => {
        const first = `#usda 1.0
def Xform "First" (
    prepend references = @./second.usda@</Second>
)
{
}
`;
        const second = `#usda 1.0
def Xform "Second" (
    prepend references = @./first.usda@</First>
)
{
}
`;
        const layers = new Map([
            ["https://example.test/first.usda", first],
            ["https://example.test/second.usda", second],
        ]);

        await expect(
            ResolveUsdStageAsync(first, "https://example.test/", "first.usda", {
                layerSource: createLayerSource(layers),
            })
        ).rejects.toMatchObject({
            name: "UsdCompositionError",
            kind: "cycle",
        });
    });

    it("diagnoses duplicate and invalid reference opinions without inventing duplicate content", async () => {
        const usda = `#usda 1.0
def Xform "Wrapper" (
    prepend references = [
        @./child.usda@</Asset>,
        @./child.usda@</Asset>,
        @./child.usda@</Missing>
    ]
)
{
}
`;
        const child = `#usda 1.0
def Xform "Asset"
{
    def Xform "Part"
    {
    }
}
`;
        const stage = await ResolveUsdStageAsync(usda, "https://example.test/", "wrapper.usda", {
            layerSource: createLayerSource(new Map([["https://example.test/child.usda", child]])),
        });

        expect(findPrim(stage.root, "/Wrapper")).toBeDefined();
        expect(findPrim(stage.root, "/Wrapper/Part")).toBeDefined();
        expect(stage.diagnostics.some((diagnostic) => /duplicate reference/i.test(diagnostic.message))).toBe(true);
        expect(stage.diagnostics.some((diagnostic) => /does not exist/i.test(diagnostic.message))).toBe(true);
    });

    it("diagnoses unsupported reference list edits while retaining supported prepend items", async () => {
        const usda = `#usda 1.0
def Xform "Wrapper" (
    prepend references = @./child.usda@</Asset>
    delete references = @./missing.usda@</Missing>
)
{
}
`;
        const child = `#usda 1.0
def Xform "Asset"
{
    def Xform "Part"
    {
    }
}
`;
        const stage = await ResolveUsdStageAsync(usda, "https://example.test/", "wrapper.usda", {
            layerSource: createLayerSource(new Map([["https://example.test/child.usda", child]])),
        });

        expect(findPrim(stage.root, "/Wrapper/Part")).toBeDefined();
        expect(stage.diagnostics.some((diagnostic) => /list operation/i.test(diagnostic.message))).toBe(true);
    });

    it("enforces layer byte, count, depth, node, and composition-work limits", async () => {
        const nested = `#usda 1.0
def Xform "Nested"
{
}
`;
        const root = `#usda 1.0
def Xform "Root" (
    prepend references = @./nested.usda@</Nested>
)
{
}
`;
        const source = createLayerSource(new Map([["https://example.test/nested.usda", nested]]));
        const limitCases = [
            { option: { maxLayerBytes: 1 }, kind: "layer-bytes" },
            { option: { maxLayerCount: 0 }, kind: "layer-count" },
            { option: { maxLayerCount: 1 }, kind: "layer-count" },
            { option: { maxLayerDepth: 0 }, kind: "layer-depth" },
            { option: { maxLayerNodes: 1 }, kind: "layer-nodes" },
            { option: { maxCompositionWork: 1 }, kind: "composition-work" },
        ] as const;

        for (const { option, kind } of limitCases) {
            await expect(
                ResolveUsdStageAsync(root, "https://example.test/", "root.usda", {
                    ...option,
                    layerSource: source,
                })
            ).rejects.toMatchObject({ name: "UsdResourceLimitError", kind });
        }
    });
});
