import { describe, expect, it } from "vitest";

import "../../src/nodeAssets/blockDescriptors";
import { BuildPaletteCategories } from "../../src/nodeAssets/paletteCategories";
import { GetAllBlockDescriptors, type IBlockDescriptor } from "../../src/nodeAssets/blockCatalog";
import { PaletteItemMatchesFilter } from "../../src/nodeGraph/paletteModel";

/** Builds a descriptor stub carrying only the fields the palette builder reads. */
function Descriptor(
    paletteItemId: string,
    label: string,
    category?: string,
    description?: string,
    keywords?: readonly string[],
    metadata?: Pick<IBlockDescriptor, "abstractedBy" | "isPaletteVisible">
): IBlockDescriptor {
    return { paletteItemId, label, category, description, keywords, ...metadata } as unknown as IBlockDescriptor;
}

describe("BuildPaletteCategories", () => {
    it("publishes the exact default product palette in canonical category, family, and item order", () => {
        const projection = BuildPaletteCategories(GetAllBlockDescriptors()).map((category) => ({
            category: category.label,
            items: category.items.map((item) => ({
                family: item.family ?? null,
                label: item.label,
            })),
        }));

        expect(projection).toEqual([
            {
                category: "Inputs",
                items: [
                    { family: "Aggregate imports", label: "Import glTF" },
                    { family: "Aggregate imports", label: "Import OBJ" },
                    { family: "Aggregate imports", label: "Import USD" },
                    { family: "Aggregate imports", label: "Import Babylon" },
                    { family: "Aggregate imports", label: "Import FBX" },
                    { family: "Aggregate imports", label: "Import Node Geometry" },
                ],
            },
            {
                category: "Universal",
                items: [
                    { family: "Cleanup", label: "Weld Vertices" },
                    { family: "Cleanup", label: "Deduplicate Resources" },
                    { family: "Cleanup", label: "Remove Unused Resources" },
                    { family: "Cleanup", label: "Remove Degenerate Geometry" },
                    { family: "Cleanup", label: "Fix Face Winding" },
                    { family: "Reduction", label: "Quantize Attributes" },
                    { family: "Reduction", label: "Simplify Meshes" },
                    { family: "Structure", label: "Flatten Hierarchy" },
                    { family: "Structure", label: "Join Meshes" },
                    { family: "Structure", label: "Split Meshes by Material" },
                    { family: "Structure", label: "Merge Scenes" },
                    { family: "Structure", label: "Transform Scene" },
                    { family: "Structure", label: "Center Scene" },
                    { family: "Attributes", label: "Recompute Normals" },
                    { family: "Attributes", label: "Generate Tangents" },
                    { family: "Attributes", label: "Strip Attributes" },
                    { family: "Textures", label: "Resize Textures" },
                ],
            },
            {
                category: "glTF",
                items: [
                    { family: "Encoding/output", label: "Compress Geometry (Draco)" },
                    { family: "Encoding/output", label: "Compress Textures (KTX2)" },
                    { family: "Encoding/output", label: "Export glTF" },
                ],
            },
        ]);
    });

    it("adds exactly the canonical primitives after the default product palette", () => {
        const defaultCategories = BuildPaletteCategories(GetAllBlockDescriptors());
        const primitiveCategories = BuildPaletteCategories(GetAllBlockDescriptors(), { showPrimitives: true });
        const additions = primitiveCategories.map((category) => {
            const defaultItemIds = new Set(defaultCategories.find((candidate) => candidate.label === category.label)?.items.map((item) => item.id) ?? []);
            return {
                category: category.label,
                items: category.items.filter((item) => !defaultItemIds.has(item.id)).map((item) => item.label),
            };
        });

        expect(primitiveCategories.map((category) => category.label)).toEqual(["Inputs", "Universal", "glTF", "OBJ", "USD", "Babylon", "FBX", "Node Geometry"]);
        for (const defaultCategory of defaultCategories) {
            expect(primitiveCategories.find((category) => category.label === defaultCategory.label)?.items.slice(0, defaultCategory.items.length)).toEqual(defaultCategory.items);
        }
        expect(additions).toEqual([
            { category: "Inputs", items: ["Read glTF", "Read OBJ", "Read USD", "Read Babylon", "Read FBX", "Read Node Geometry"] },
            {
                category: "Universal",
                items: ["Universal → glTF", "Deduplicate Materials", "Deduplicate Textures", "Reuse Identical Meshes", "Deduplicate Data"],
            },
            { category: "glTF", items: ["glTF → Universal", "Write glTF"] },
            { category: "OBJ", items: ["OBJ to Universal"] },
            { category: "USD", items: ["USD → Universal"] },
            { category: "Babylon", items: ["Babylon → Universal"] },
            { category: "FBX", items: ["FBX \u2192 Universal"] },
            { category: "Node Geometry", items: ["Node Geometry → Universal"] },
        ]);
    });

    it("uses the filtered product catalog for search", () => {
        expect(BuildPaletteCategories(GetAllBlockDescriptors(), { filter: "selector", showPrimitives: true })).toEqual([]);
        expect(BuildPaletteCategories(GetAllBlockDescriptors(), { filter: "Write glTF" })).toEqual([]);
        expect(BuildPaletteCategories(GetAllBlockDescriptors(), { filter: "Write glTF", showPrimitives: true })).toMatchObject([
            { label: "glTF", items: [{ label: "Write glTF" }] },
        ]);
    });

    it("finds the FBX aggregate by default and its primitives only when requested", () => {
        expect(BuildPaletteCategories(GetAllBlockDescriptors(), { filter: "fbx" }).flatMap((category) => category.items.map((item) => item.label))).toEqual(["Import FBX"]);
        expect(BuildPaletteCategories(GetAllBlockDescriptors(), { filter: "fbx", showPrimitives: true }).flatMap((category) => category.items.map((item) => item.label))).toEqual(
            expect.arrayContaining(["Import FBX", "Read FBX", "FBX \u2192 Universal"])
        );
    });

    it("returns no categories for an empty descriptor list", () => {
        expect(BuildPaletteCategories([])).toEqual([]);
    });

    it("groups descriptors by category, preserving registration order across and within categories", () => {
        const categories = BuildPaletteCategories([Descriptor("a", "A", "Sources"), Descriptor("b", "B", "Compression"), Descriptor("c", "C", "Sources")]);

        expect(categories).toEqual([
            {
                label: "Sources",
                items: [
                    { id: "a", label: "A" },
                    { id: "c", label: "C" },
                ],
            },
            { label: "Compression", items: [{ id: "b", label: "B" }] },
        ]);
    });

    it("falls back to the default category for descriptors without one", () => {
        const categories = BuildPaletteCategories([Descriptor("a", "A"), Descriptor("b", "B", "Sources")]);

        expect(categories).toEqual([
            { label: "Blocks", items: [{ id: "a", label: "A" }] },
            { label: "Sources", items: [{ id: "b", label: "B" }] },
        ]);
    });

    it("preserves discovery metadata on palette items", () => {
        const categories = BuildPaletteCategories([Descriptor("simplify", "Simplify", "Operators", "Reduce mesh complexity.", ["decimate", "LOD"])]);

        expect(categories[0].items[0]).toEqual({
            id: "simplify",
            label: "Simplify",
            description: "Reduce mesh complexity.",
            keywords: ["decimate", "LOD"],
        });
    });

    it("hides aggregate primitives by default and reveals only authorable primitives on request", () => {
        const descriptors = [
            Descriptor("import-gltf", "Import glTF", "Inputs"),
            Descriptor("read-gltf", "Read glTF", "Inputs", undefined, undefined, { abstractedBy: "import-gltf" }),
            Descriptor("legacy-import-gltf", "Legacy Import glTF", "Inputs", undefined, undefined, {
                abstractedBy: undefined,
                isPaletteVisible: false,
            }),
        ];

        expect(BuildPaletteCategories(descriptors).flatMap((category) => category.items.map((item) => item.label))).toEqual(["Import glTF"]);
        expect(BuildPaletteCategories(descriptors, { showPrimitives: true }).flatMap((category) => category.items.map((item) => item.label))).toEqual(["Import glTF", "Read glTF"]);
    });

    it("uses the same primitive visibility for search and omits empty primitive-only categories", () => {
        const descriptors = [
            Descriptor("import-babylon", "Import Babylon", "Inputs"),
            Descriptor("babylon-to-universal", "Babylon to Universal", "Babylon", "Cross into Universal.", ["convert"], {
                abstractedBy: "import-babylon",
                isPaletteVisible: undefined,
            }),
        ];

        expect(BuildPaletteCategories(descriptors).map((category) => category.label)).toEqual(["Inputs"]);
        expect(BuildPaletteCategories(descriptors, { filter: "convert" })).toEqual([]);
        expect(BuildPaletteCategories(descriptors, { filter: "convert", showPrimitives: true })).toEqual([
            {
                label: "Babylon",
                items: [
                    {
                        id: "babylon-to-universal",
                        label: "Babylon to Universal",
                        description: "Cross into Universal.",
                        keywords: ["convert"],
                    },
                ],
            },
        ]);
    });

    it.each([
        ["decimate", "Simplify"],
        ["optimize", "Prune"],
        ["compress", "Apply BasisU"],
    ])("finds the intended workflow for %s", (filter, expectedLabel) => {
        const categories = BuildPaletteCategories([
            Descriptor("simplify", "Simplify", "Operators", "Reduce mesh complexity for runtime delivery.", ["decimate", "LOD"]),
            Descriptor("prune", "Prune", "Operators", "Remove unused resources.", ["optimize", "cleanup"]),
            Descriptor("ktx2", "Apply BasisU", "Compression", "Encode textures with Basis Universal.", ["compress"]),
        ]);
        const matches = categories.flatMap((category) => category.items.filter((item) => PaletteItemMatchesFilter(item, category.label, filter)));

        expect(matches.map((item) => item.label)).toContain(expectedLabel);
    });

    it("matches descriptions and categories and rejects unrelated text", () => {
        const item = BuildPaletteCategories([Descriptor("simplify", "Simplify", "Operators", "Reduce mesh complexity for runtime delivery.")])[0].items[0];

        expect(PaletteItemMatchesFilter(item, "Operators", "runtime")).toBe(true);
        expect(PaletteItemMatchesFilter(item, "Operators", "operators")).toBe(true);
        expect(PaletteItemMatchesFilter(item, "Operators", "texture")).toBe(false);
    });
});
