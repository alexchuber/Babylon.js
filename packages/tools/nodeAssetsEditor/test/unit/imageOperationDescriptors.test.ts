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

describe("image operation descriptors", () => {
    it("keeps retired image operations load-compatible but not newly authorable", () => {
        const controller = new NodeAssetGraphController();
        try {
            for (const paletteItemId of ["resize-image", "convert-image-format", "flip-image"]) {
                expect(GetBlockDescriptorByPaletteItemId(paletteItemId)?.isPaletteVisible).toBe(false);
                expect(() => controller.createNodeFromPaletteItem(paletteItemId, { x: 200, y: 200 })).toThrow("load-only");
            }
        } finally {
            controller.dispose();
        }
    });

    it("surfaces Resize Image width/height as sliders that write back to the block", () => {
        const { descriptor, block } = CreateLoadCompatibleBlock("resize-image");

        expect(FindProperty(descriptor, block, "Width", "slider").value).toBe(256);
        expect(FindProperty(descriptor, block, "Height", "slider").value).toBe(256);

        FindProperty(descriptor, block, "Width", "slider").onChange(128);
        FindProperty(descriptor, block, "Height", "slider").onChange(64);

        expect(FindProperty(descriptor, block, "Width", "slider").value).toBe(128);
        expect(FindProperty(descriptor, block, "Height", "slider").value).toBe(64);
    });

    it("surfaces Convert Image Format as a format dropdown and quality slider", () => {
        const { descriptor, block } = CreateLoadCompatibleBlock("convert-image-format");

        const format = FindProperty(descriptor, block, "Format", "dropdown");
        expect(format.value).toBe("png");
        expect(format.options).toEqual(["png", "jpeg", "webp"]);
        expect(FindProperty(descriptor, block, "Quality", "slider").value).toBe(0.9);

        format.onChange("webp");
        FindProperty(descriptor, block, "Quality", "slider").onChange(0.5);

        expect(FindProperty(descriptor, block, "Format", "dropdown").value).toBe("webp");
        expect(FindProperty(descriptor, block, "Quality", "slider").value).toBe(0.5);
    });

    it("surfaces Flip Image as an axis dropdown that writes back to the block", () => {
        const { descriptor, block } = CreateLoadCompatibleBlock("flip-image");

        const axis = FindProperty(descriptor, block, "Axis", "dropdown");
        expect(axis.value).toBe("horizontal");
        expect(axis.options).toEqual(["horizontal", "vertical"]);

        axis.onChange("vertical");

        expect(FindProperty(descriptor, block, "Axis", "dropdown").value).toBe("vertical");
    });
});
