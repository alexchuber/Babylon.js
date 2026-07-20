import { describe, expect, it } from "vitest";

import { type NodeAssetBlock } from "node-assets/blockFoundation/nodeAssetBlock";
import { NodeAsset } from "node-assets/nodeAsset";

import { type PropertyDescriptor } from "../../src/nodeGraph/propertyModel";
import { GetBlockDescriptorByPaletteItemId, type IBlockDescriptor } from "../../src/nodeAssets/blockCatalog";
import { NodeAssetGraphController } from "../../src/nodeAssets/nodeAssetGraphController";

function CreateLoadCompatibleBlock(paletteItemId: string): { readonly descriptor: IBlockDescriptor; readonly block: NodeAssetBlock } {
    const descriptor = GetBlockDescriptorByPaletteItemId(paletteItemId);
    if (!descriptor) {
        throw new Error(`Could not find descriptor "${paletteItemId}".`);
    }
    return { descriptor, block: descriptor.create(new NodeAsset()) };
}

function FindProperty<TKind extends PropertyDescriptor["kind"]>(
    descriptor: IBlockDescriptor,
    block: NodeAssetBlock,
    label: string,
    kind: TKind
): Extract<PropertyDescriptor, { kind: TKind }> {
    const property = descriptor.getPropertySection!(block, { prepareEdit: (candidate) => candidate, refresh: () => undefined, requestExport: () => undefined }).properties.find(
        (candidate) => candidate.label === label
    );
    if (!property || property.kind !== kind) {
        throw new Error(`Could not find ${kind} property "${label}" on "${block.name}".`);
    }
    return property as Extract<PropertyDescriptor, { kind: TKind }>;
}

describe("composite image descriptor", () => {
    it("keeps Composite Image load-compatible but not newly authorable", () => {
        const controller = new NodeAssetGraphController();
        try {
            const descriptor = GetBlockDescriptorByPaletteItemId("composite-image");
            expect(descriptor?.isPaletteVisible).toBe(false);
            expect(() => controller.createNodeFromPaletteItem("composite-image", { x: 200, y: 200 })).toThrow("load-only");
        } finally {
            controller.dispose();
        }
    });

    it("surfaces Composite Image offset X/Y as text lines that write numbers back to the block", () => {
        const { descriptor, block } = CreateLoadCompatibleBlock("composite-image");

        expect(FindProperty(descriptor, block, "Offset X", "text").value).toBe("0");
        expect(FindProperty(descriptor, block, "Offset Y", "text").value).toBe("0");

        FindProperty(descriptor, block, "Offset X", "text").onChange("12");
        FindProperty(descriptor, block, "Offset Y", "text").onChange("-8");

        expect(FindProperty(descriptor, block, "Offset X", "text").value).toBe("12");
        expect(FindProperty(descriptor, block, "Offset Y", "text").value).toBe("-8");
    });

    it("validates offset lines as finite numbers, accepting negatives and rejecting non-numbers", () => {
        const { descriptor, block } = CreateLoadCompatibleBlock("composite-image");
        const offsetX = FindProperty(descriptor, block, "Offset X", "text");

        expect(offsetX.validator!("-15")).toBe(true);
        expect(offsetX.validator!("42")).toBe(true);
        expect(offsetX.validator!("")).toBe(false);
        expect(offsetX.validator!("abc")).toBe(false);
    });
});
