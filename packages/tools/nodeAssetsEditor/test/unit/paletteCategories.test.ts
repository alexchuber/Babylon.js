import { describe, expect, it } from "vitest";

import { BuildPaletteCategories } from "../../src/nodeAssets/paletteCategories";
import { type IBlockDescriptor } from "../../src/nodeAssets/blockCatalog";

/** Builds a descriptor stub carrying only the fields the palette builder reads. */
function Descriptor(paletteItemId: string, label: string, category?: string): IBlockDescriptor {
    return { paletteItemId, label, category } as unknown as IBlockDescriptor;
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
});
