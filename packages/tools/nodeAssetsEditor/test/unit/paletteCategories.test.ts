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
        expect(BuildPaletteCategories(GetAllBlockDescriptors()).map((category) => category.label)).toEqual(["Importers", "Exporters", "glTF", "Universal"]);
    });

    it("orders the full palette with importers and exporters after outputs", () => {
        expect(BuildPaletteCategories(GetAllBlockDescriptors(), { showPrimitives: true }).map((category) => category.label)).toEqual([
            "Inputs",
            "Transcoders",
            "Outputs",
            "Importers",
            "Exporters",
            "glTF",
            "Universal",
        ]);
    });

    it("publishes the default product palette with aggregates and without abstracted primitives", () => {
        const projection = BuildPaletteCategories(GetAllBlockDescriptors());
        const categoryLabels = projection.map((category) => category.label);
        const allLabels = projection.flatMap((category) => category.items.map((item) => item.label));

        // Aggregates lead the default palette, including their aggregate-only categories
        expect(categoryLabels).toEqual(expect.arrayContaining(["Importers", "Exporters"]));
        expect(allLabels).toEqual(
            expect.arrayContaining(["Import glTF", "Import Babylon", "Import FBX", "Import OBJ", "Import USD", "Import Node Geometry", "Export glTF", "Deduplicate Resources"])
        );

        // The decomposed primitive stages are hidden until Show primitives is enabled
        expect(categoryLabels).not.toContain("Inputs");
        expect(categoryLabels).not.toContain("Transcoders");
        expect(categoryLabels).not.toContain("Outputs");
        for (const label of ["glTF → Universal", "Babylon → Universal", "Universal → glTF", "Deduplicate Materials", "Reuse Identical Meshes"]) {
            expect(allLabels).not.toContain(label);
        }

        // Standalone blocks without an aggregate still appear
        expect(allLabels).toContain("Weld Vertices");
        expect(allLabels).toContain("Compress Geometry (Draco)");
        expect(allLabels).toContain("Compress Textures (KTX2)");
    });

    it("adds exactly the abstracted primitives after the default product palette", () => {
        const defaultCategories = BuildPaletteCategories(GetAllBlockDescriptors());
        const allCategories = BuildPaletteCategories(GetAllBlockDescriptors(), { showPrimitives: true });
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
                    items: expect.arrayContaining(["Babylon", "FBX", "glTF", "Node Geometry", "OBJ", "USD"]),
                }),
                expect.objectContaining({ category: "Transcoders", items: expect.arrayContaining(["glTF → Universal", "Universal → glTF"]) }),
                expect.objectContaining({
                    category: "Universal",
                    items: expect.arrayContaining(["Deduplicate Materials", "Deduplicate Textures", "Reuse Identical Meshes", "Deduplicate Data"]),
                }),
                expect.objectContaining({ category: "Outputs", items: expect.arrayContaining(["glTF"]) }),
            ])
        );
    });

    it("uses the filtered product catalog for search", () => {
        expect(BuildPaletteCategories(GetAllBlockDescriptors(), { filter: "selector", showPrimitives: true })).toEqual([]);
        expect(BuildPaletteCategories(GetAllBlockDescriptors(), { filter: "Compress Geometry" })).toMatchObject([
            { label: "glTF", items: [{ label: "Compress Geometry (Draco)" }] },
        ]);
        // Aggregates are discoverable by default; their abstracted primitives only when requested
        expect(BuildPaletteCategories(GetAllBlockDescriptors(), { filter: "Import glTF" })).toMatchObject([{ label: "Importers", items: [{ label: "Import glTF" }] }]);
        expect(BuildPaletteCategories(GetAllBlockDescriptors(), { filter: "glTF → Universal" })).toEqual([]);
        expect(BuildPaletteCategories(GetAllBlockDescriptors(), { filter: "glTF → Universal", showPrimitives: true })).toMatchObject([
            { label: "Transcoders", items: [{ label: "glTF → Universal" }] },
        ]);
    });

    it("finds the FBX aggregate by default and its primitives only when requested", () => {
        const defaultLabels = BuildPaletteCategories(GetAllBlockDescriptors(), { filter: "fbx" }).flatMap((category) => category.items.map((item) => item.label));
        expect(defaultLabels).toContain("Import FBX");
        expect(defaultLabels).not.toContain("FBX");
        expect(defaultLabels).not.toContain("FBX → Universal");
        expect(BuildPaletteCategories(GetAllBlockDescriptors(), { filter: "fbx", showPrimitives: true }).flatMap((category) => category.items.map((item) => item.label))).toEqual(
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

    it("hides abstracted primitives by default and reveals them on request", () => {
        const descriptors = [
            Descriptor("import-gltf", "Import glTF", "Inputs"),
            Descriptor("gltf-input", "glTF", "Inputs", undefined, undefined, { abstractedBy: "import-gltf" }),
            Descriptor("legacy-import-gltf", "Legacy Import glTF", "Inputs", undefined, undefined, {
                abstractedBy: undefined,
                isPaletteVisible: false,
            }),
        ];

        expect(BuildPaletteCategories(descriptors).flatMap((category) => category.items.map((item) => item.label))).toEqual(["Import glTF"]);
        expect(BuildPaletteCategories(descriptors, { showPrimitives: true }).flatMap((category) => category.items.map((item) => item.label))).toEqual(["Import glTF", "glTF"]);
    });

    it("uses the same primitive visibility for search and omits empty primitive-only categories", () => {
        const descriptors = [
            Descriptor("import-babylon", "Import Babylon", "Inputs"),
            Descriptor("babylon-to-universal", "Babylon → Universal", "Babylon", "Cross into Universal.", ["convert"], {
                abstractedBy: "import-babylon",
                isPaletteVisible: undefined,
            }),
        ];

        // The abstracted primitive's category is empty until Show primitives is enabled
        expect(BuildPaletteCategories(descriptors).map((category) => category.label)).toEqual(["Inputs"]);
        expect(BuildPaletteCategories(descriptors, { filter: "convert" })).toEqual([]);
        expect(BuildPaletteCategories(descriptors, { filter: "convert", showPrimitives: true })).toEqual([
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
        // The aggregate is discoverable by default
        expect(BuildPaletteCategories(descriptors, { filter: "Import" })).toMatchObject([{ label: "Inputs", items: [{ label: "Import Babylon" }] }]);
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
