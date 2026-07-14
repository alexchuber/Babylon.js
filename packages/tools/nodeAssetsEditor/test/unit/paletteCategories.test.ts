import { describe, expect, it } from "vitest";

import { BuildPaletteCategories } from "../../src/nodeAssets/paletteCategories";
import { type IBlockDescriptor } from "../../src/nodeAssets/blockCatalog";
import { PaletteItemMatchesFilter } from "../../src/nodeGraph/paletteModel";

/** Builds a descriptor stub carrying only the fields the palette builder reads. */
function Descriptor(paletteItemId: string, label: string, category?: string, description?: string, keywords?: readonly string[]): IBlockDescriptor {
    return { paletteItemId, label, category, description, keywords } as unknown as IBlockDescriptor;
}

describe("BuildPaletteCategories", () => {
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
