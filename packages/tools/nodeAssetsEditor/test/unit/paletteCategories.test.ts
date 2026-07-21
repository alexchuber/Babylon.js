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
    it("places the FBX aggregate between Babylon and Node Geometry without pinning palette totals", () => {
        const inputs = BuildPaletteCategories(GetAllBlockDescriptors())
            .find((category) => category.label === "Inputs")
            ?.items.map((item) => item.label);
        if (!inputs) {
            throw new Error("The Inputs palette category was not registered.");
        }

        expect(inputs).toEqual(expect.arrayContaining(["Import glTF", "Import USD", "Import Babylon", "Import FBX", "Import Node Geometry"]));
        expect(inputs.indexOf("Import Babylon")).toBeLessThan(inputs.indexOf("Import FBX"));
        expect(inputs.indexOf("Import FBX")).toBeLessThan(inputs.indexOf("Import Node Geometry"));
        for (const label of ["Import Babylon", "Import FBX", "Import Node Geometry"]) {
            expect(
                BuildPaletteCategories(GetAllBlockDescriptors())
                    .find((category) => category.label === "Inputs")
                    ?.items.find((item) => item.label === label)?.family
            ).toBe("Aggregate imports");
        }
    });

    it("hides FBX primitives by default and preserves source-lane order when primitives are shown", () => {
        const defaultCategories = BuildPaletteCategories(GetAllBlockDescriptors());
        const primitiveCategories = BuildPaletteCategories(GetAllBlockDescriptors(), { showPrimitives: true });
        const defaultLabels = defaultCategories.flatMap((category) => category.items.map((item) => item.label));
        const primitiveLabels = primitiveCategories.flatMap((category) => category.items.map((item) => item.label));
        const categoryLabels = primitiveCategories.map((category) => category.label);
        const inputLabels = primitiveCategories.find((category) => category.label === "Inputs")?.items.map((item) => item.label) ?? [];

        expect(defaultLabels).not.toContain("Read FBX");
        expect(defaultLabels).not.toContain("FBX \u2192 Universal");
        expect(primitiveLabels).toEqual(expect.arrayContaining(["Read FBX", "FBX \u2192 Universal"]));
        expect(categoryLabels).toEqual(expect.arrayContaining(["Babylon", "FBX", "Node Geometry"]));
        expect(categoryLabels.indexOf("Babylon")).toBeLessThan(categoryLabels.indexOf("FBX"));
        expect(categoryLabels.indexOf("FBX")).toBeLessThan(categoryLabels.indexOf("Node Geometry"));
        expect(inputLabels.indexOf("Read Babylon")).toBeLessThan(inputLabels.indexOf("Read FBX"));
        expect(inputLabels.indexOf("Read FBX")).toBeLessThan(inputLabels.indexOf("Read Node Geometry"));
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
