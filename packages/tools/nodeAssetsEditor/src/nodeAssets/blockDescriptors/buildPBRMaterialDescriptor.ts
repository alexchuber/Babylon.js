import { Color3 } from "core/Maths/math.color";

import { BuildPBRMaterial } from "node-assets/Blocks/buildPBRMaterial";

import { CompositionCategory, CompositionHeaderColor, RegisterBlockDescriptor } from "../blockCatalog";

/**
 * Renders the RGB channels of a linear color factor as an editable hex string. Alpha (when present) is
 * carried separately, so this only reflects the first three components.
 * @param factor - The color factor whose RGB is shown.
 * @returns The `#rrggbb` hex string.
 */
function FactorToHex(factor: readonly [number, number, number, ...number[]]): string {
    return new Color3(factor[0], factor[1], factor[2]).toHexString();
}

RegisterBlockDescriptor({
    paletteItemId: "build-pbr-material",
    label: "Build PBR Material",
    headerColor: CompositionHeaderColor,
    category: CompositionCategory,
    className: BuildPBRMaterial.ClassName,
    create: (nodeAsset) => new BuildPBRMaterial("Build PBR Material", nodeAsset),
    getPropertySection: (block, { refresh }) => {
        const build = block as BuildPBRMaterial;
        return {
            title: "BUILD PBR MATERIAL",
            properties: [
                {
                    kind: "color",
                    label: "Base color",
                    value: FactorToHex(build.baseColorFactor),
                    onChange: (value) => {
                        const color = Color3.FromHexString(value);
                        build.baseColorFactor = [color.r, color.g, color.b, build.baseColorFactor[3]];
                        refresh();
                    },
                },
                {
                    kind: "slider",
                    label: "Base alpha",
                    value: build.baseColorFactor[3],
                    min: 0,
                    max: 1,
                    step: 0.01,
                    onChange: (value) => {
                        build.baseColorFactor = [build.baseColorFactor[0], build.baseColorFactor[1], build.baseColorFactor[2], value];
                        refresh();
                    },
                },
                {
                    kind: "slider",
                    label: "Metallic",
                    value: build.metallicFactor,
                    min: 0,
                    max: 1,
                    step: 0.01,
                    onChange: (value) => {
                        build.metallicFactor = value;
                        refresh();
                    },
                },
                {
                    kind: "slider",
                    label: "Roughness",
                    value: build.roughnessFactor,
                    min: 0,
                    max: 1,
                    step: 0.01,
                    onChange: (value) => {
                        build.roughnessFactor = value;
                        refresh();
                    },
                },
                {
                    kind: "color",
                    label: "Emissive",
                    value: FactorToHex(build.emissiveFactor),
                    onChange: (value) => {
                        const color = Color3.FromHexString(value);
                        build.emissiveFactor = [color.r, color.g, color.b];
                        refresh();
                    },
                },
            ],
        };
    },
});
