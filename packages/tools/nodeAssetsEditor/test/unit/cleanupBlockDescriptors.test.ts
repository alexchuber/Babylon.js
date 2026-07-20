import { PropertyType } from "@gltf-transform/core";
import { describe, expect, it, vi } from "vitest";

import { FixFaceWindingBlock } from "node-assets/Blocks/fixFaceWindingBlock";
import { RemoveDegenerateGeometryBlock } from "node-assets/Blocks/removeDegenerateGeometryBlock";
import { RemoveUnusedResourcesBlock } from "node-assets/Blocks/removeUnusedResourcesBlock";
import { WeldVerticesBlock } from "node-assets/Blocks/weldVerticesBlock";
import { NodeAsset } from "node-assets/nodeAsset";

import "../../src/nodeAssets/blockDescriptors";
import { GetBlockDescriptorByPaletteItemId, type IBlockDescriptor } from "../../src/nodeAssets/blockCatalog";
import { type IPropertySection, type PropertyDescriptor } from "../../src/nodeGraph/propertyModel";

function GetDescriptor(paletteItemId: string): IBlockDescriptor {
    const descriptor = GetBlockDescriptorByPaletteItemId(paletteItemId);
    if (!descriptor) {
        throw new Error(`Missing descriptor "${paletteItemId}".`);
    }
    return descriptor;
}

function GetProperty<TKind extends PropertyDescriptor["kind"]>(section: IPropertySection, index: number, kind: TKind): Extract<PropertyDescriptor, { kind: TKind }> {
    const property = section.properties[index];
    if (property.kind !== kind) {
        throw new Error(`Expected property ${index} to be "${kind}".`);
    }
    return property as Extract<PropertyDescriptor, { kind: TKind }>;
}

describe("Universal cleanup block descriptors", () => {
    it("exposes the approved names and Universal cleanup metadata", () => {
        expect(
            ["weld-vertices", "remove-unused-resources", "remove-degenerate-geometry", "fix-face-winding"].map((paletteItemId) => {
                const descriptor = GetDescriptor(paletteItemId);
                return {
                    label: descriptor.label,
                    category: descriptor.category,
                    family: descriptor.family,
                    description: descriptor.description,
                };
            })
        ).toEqual([
            {
                label: "Weld Vertices",
                category: "Universal",
                family: "Cleanup",
                description: "Merge equivalent vertices and index mesh primitives.",
            },
            {
                label: "Remove Unused Resources",
                category: "Universal",
                family: "Cleanup",
                description: "Remove resources that are no longer referenced by the scene.",
            },
            {
                label: "Remove Degenerate Geometry",
                category: "Universal",
                family: "Cleanup",
                description: "Remove zero-area and near-zero-area triangles.",
            },
            {
                label: "Fix Face Winding",
                category: "Universal",
                family: "Cleanup",
                description: "Make adjacent triangle faces use consistent winding.",
            },
        ]);
    });

    it("writes every approved cleanup property to its runtime block", () => {
        const asset = new NodeAsset("descriptor-properties");
        const refresh = vi.fn();
        const context = { refresh, requestExport: vi.fn() };

        const weldDescriptor = GetDescriptor("weld-vertices");
        const weld = weldDescriptor.create(asset) as WeldVerticesBlock;
        const weldSection = weldDescriptor.getPropertySection!(weld, context);
        expect(weldSection.properties.map((property) => property.label)).toEqual(["Overwrite existing"]);
        GetProperty(weldSection, 0, "switch").onChange(false);

        const removeUnusedDescriptor = GetDescriptor("remove-unused-resources");
        const removeUnused = removeUnusedDescriptor.create(asset) as RemoveUnusedResourcesBlock;
        const removeUnusedSection = removeUnusedDescriptor.getPropertySection!(removeUnused, context);
        expect(removeUnusedSection.properties.map((property) => property.label)).toEqual([
            "Kept property types",
            "Keep leaf nodes",
            "Keep attributes",
            "Keep solid textures",
            "Keep extras",
        ]);
        expect(GetProperty(removeUnusedSection, 0, "text").validator?.("NotAProperty")).toBe(false);
        GetProperty(removeUnusedSection, 0, "text").onChange("Mesh, Camera");
        GetProperty(removeUnusedSection, 1, "switch").onChange(true);
        GetProperty(removeUnusedSection, 2, "switch").onChange(true);
        GetProperty(removeUnusedSection, 3, "switch").onChange(true);
        GetProperty(removeUnusedSection, 4, "switch").onChange(true);

        const removeDegenerateDescriptor = GetDescriptor("remove-degenerate-geometry");
        const removeDegenerate = removeDegenerateDescriptor.create(asset) as RemoveDegenerateGeometryBlock;
        const removeDegenerateSection = removeDegenerateDescriptor.getPropertySection!(removeDegenerate, context);
        expect(removeDegenerateSection.properties.map((property) => property.label)).toEqual(["Tolerance"]);
        expect(GetProperty(removeDegenerateSection, 0, "text").validator?.("-1")).toBe(false);
        GetProperty(removeDegenerateSection, 0, "text").onChange("0.0001");

        const fixWindingDescriptor = GetDescriptor("fix-face-winding");
        const fixWinding = fixWindingDescriptor.create(asset) as FixFaceWindingBlock;

        expect(weld.overwrite).toBe(false);
        expect(removeUnused.keptPropertyTypes).toEqual([PropertyType.MESH, PropertyType.CAMERA]);
        expect(removeUnused.keepLeafNodes).toBe(true);
        expect(removeUnused.keepAttributes).toBe(true);
        expect(removeUnused.keepSolidTextures).toBe(true);
        expect(removeUnused.keepExtras).toBe(true);
        expect(removeDegenerate.tolerance).toBe(0.0001);
        expect(fixWindingDescriptor.getPropertySection).toBeUndefined();
        expect(fixWinding.getClassName()).toBe(FixFaceWindingBlock.ClassName);
        expect(refresh).toHaveBeenCalledTimes(7);
    });
});
