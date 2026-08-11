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
    it("orders the default product palette by pipeline stage", () => {
        expect(BuildPaletteCategories(GetAllBlockDescriptors()).map((category) => category.label)).toEqual(["Inputs", "Importers", "Exporters", "Outputs", "glTF", "Universal"]);
    });

    it("publishes the default product palette without aggregates", () => {
        const projection = BuildPaletteCategories(GetAllBlockDescriptors()).map((category) => ({
            category: category.label,
            items: category.items.map((item) => ({
                family: item.family ?? null,
                label: item.label,
            })),
        }));
        const LabelsIn = (category: string) => projection.find((candidate) => candidate.category === category)?.items.map((item) => item.label);

        // No aggregate labels appear in the default palette
        const allLabels = projection.flatMap((c) => c.items.map((i) => i.label));
        expect(allLabels).not.toContain("Import glTF");
        expect(allLabels).not.toContain("Import Babylon");
        expect(allLabels).not.toContain("Import FBX");
        expect(allLabels).not.toContain("Import OBJ");
        expect(allLabels).not.toContain("Import USD");
        expect(allLabels).not.toContain("Import Node Geometry");
        expect(allLabels).not.toContain("Export glTF");
        expect(allLabels).not.toContain("Deduplicate Resources");

        // Every source boundary, transcoder, and output boundary sits in its pipeline-stage category
        expect(LabelsIn("Inputs")).toEqual(["Babylon", "FBX", "glTF", "Node Geometry", "OBJ", "USD"]);
        expect(LabelsIn("Importers")).toEqual(["glTF → Universal", "OBJ → Universal", "USD → Universal", "Babylon → Universal", "FBX → Universal", "Node Geometry → Universal"]);
        expect(LabelsIn("Exporters")).toEqual(["Universal → glTF"]);
        expect(LabelsIn("Outputs")).toEqual(["glTF"]);
        expect(LabelsIn("glTF")).toEqual(["Compress Geometry (Draco)", "Compress Textures (KTX2)"]);

        // Non-aggregate blocks still appear
        expect(allLabels).toContain("Weld Vertices");
        expect(allLabels).toContain("Compress Geometry (Draco)");
    });

    it("adds exactly the canonical aggregates after the default product palette", () => {
        const defaultCategories = BuildPaletteCategories(GetAllBlockDescriptors());
        const allCategories = BuildPaletteCategories(GetAllBlockDescriptors(), { showAggregates: true });
        const additions = allCategories.map((category) => {
            const defaultItemIds = new Set(defaultCategories.find((candidate) => candidate.label === category.label)?.items.map((item) => item.id) ?? []);
            return {
                category: category.label,
                items: category.items.filter((item) => !defaultItemIds.has(item.id)).map((item) => item.label),
            };
        });

        expect(allCategories.map((category) => category.label)).toEqual(expect.arrayContaining(defaultCategories.map((category) => category.label)));
        for (const defaultCategory of defaultCategories) {
            expect(allCategories.find((category) => category.label === defaultCategory.label)?.items.slice(0, defaultCategory.items.length)).toEqual(defaultCategory.items);
        }
        expect(additions).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    category: "Inputs",
                    items: expect.arrayContaining(["Import glTF", "Import OBJ", "Import USD", "Import Babylon", "Import FBX", "Import Node Geometry"]),
                }),
                expect.objectContaining({ category: "Universal", items: expect.arrayContaining(["Deduplicate Resources"]) }),
                expect.objectContaining({ category: "Outputs", items: expect.arrayContaining(["Export glTF"]) }),
            ])
        );
    });

    it("uses the filtered product catalog for search", () => {
        expect(BuildPaletteCategories(GetAllBlockDescriptors(), { filter: "selector", showAggregates: true })).toEqual([]);
        expect(BuildPaletteCategories(GetAllBlockDescriptors(), { filter: "Compress Geometry" })).toMatchObject([
            { label: "glTF", items: [{ label: "Compress Geometry (Draco)" }] },
        ]);
        expect(BuildPaletteCategories(GetAllBlockDescriptors(), { filter: "Import glTF" })).toEqual([]);
        expect(BuildPaletteCategories(GetAllBlockDescriptors(), { filter: "Import glTF", showAggregates: true })).toMatchObject([
            { label: "Inputs", items: [{ label: "Import glTF" }] },
        ]);
    });

    it("finds the FBX primitives by default and its aggregate only when requested", () => {
        expect(BuildPaletteCategories(GetAllBlockDescriptors(), { filter: "fbx" }).flatMap((category) => category.items.map((item) => item.label))).toEqual(
            expect.arrayContaining(["FBX", "FBX → Universal"])
        );
        expect(BuildPaletteCategories(GetAllBlockDescriptors(), { filter: "fbx", showAggregates: true }).flatMap((category) => category.items.map((item) => item.label))).toEqual(
            expect.arrayContaining(["Import FBX", "FBX", "FBX → Universal"])
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

    it("hides aggregates by default and reveals them on request", () => {
        const descriptors = [
            Descriptor("import-gltf", "Import glTF", "Inputs"),
            Descriptor("gltf-input", "glTF", "Inputs", undefined, undefined, { abstractedBy: "import-gltf" }),
            Descriptor("legacy-import-gltf", "Legacy Import glTF", "Inputs", undefined, undefined, {
                abstractedBy: undefined,
                isPaletteVisible: false,
            }),
        ];

        expect(BuildPaletteCategories(descriptors).flatMap((category) => category.items.map((item) => item.label))).toEqual(["glTF"]);
        expect(BuildPaletteCategories(descriptors, { showAggregates: true }).flatMap((category) => category.items.map((item) => item.label))).toEqual(["glTF", "Import glTF"]);
    });

    it("uses the same aggregate visibility for search and omits empty aggregate-only categories", () => {
        const descriptors = [
            Descriptor("import-babylon", "Import Babylon", "Inputs"),
            Descriptor("babylon-to-universal", "Babylon → Universal", "Babylon", "Cross into Universal.", ["convert"], {
                abstractedBy: "import-babylon",
                isPaletteVisible: undefined,
            }),
        ];

        expect(BuildPaletteCategories(descriptors).map((category) => category.label)).toEqual(["Babylon"]);
        expect(BuildPaletteCategories(descriptors, { filter: "convert" })).toEqual([
            {
                label: "Babylon",
                items: [
                    {
                        id: "babylon-to-universal",
                        label: "Babylon → Universal",
                        description: "Cross into Universal.",
                        keywords: ["convert"],
                    },
                ],
            },
        ]);
        expect(BuildPaletteCategories(descriptors, { filter: "Import" })).toEqual([]);
        expect(BuildPaletteCategories(descriptors, { filter: "Import", showAggregates: true })).toMatchObject([{ label: "Inputs", items: [{ label: "Import Babylon" }] }]);
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
