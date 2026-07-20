import { QuantizationVolume, QuantizeAttributesBlock } from "node-assets/Blocks/quantizeAttributesBlock";

import { OperatorCategory, OperatorHeaderColor, RegisterBlockDescriptor } from "../blockCatalog";

const QuantizationVolumeLabels = ["Mesh", "Scene"] as const;

function QuantizationVolumeToLabel(volume: QuantizationVolume): (typeof QuantizationVolumeLabels)[number] {
    return volume === QuantizationVolume.Scene ? "Scene" : "Mesh";
}

function QuantizationVolumeFromLabel(label: string): QuantizationVolume {
    return label === "Scene" ? QuantizationVolume.Scene : QuantizationVolume.Mesh;
}

function IsValidPattern(value: string): boolean {
    try {
        new RegExp(value);
        return true;
    } catch {
        return false;
    }
}

RegisterBlockDescriptor({
    paletteItemId: "quantize-attributes",
    label: "Quantize Attributes",
    description: "Reduce selected Universal vertex attributes to configurable precision.",
    keywords: ["optimize", "compress", "precision", "mesh size"],
    headerColor: OperatorHeaderColor,
    category: OperatorCategory,
    className: QuantizeAttributesBlock.ClassName,
    create: (nodeAsset) => new QuantizeAttributesBlock("Quantize Attributes", nodeAsset),
    getPropertySection: (block, { refresh }) => {
        const quantize = block as QuantizeAttributesBlock;
        const bitSlider = (label: string, value: number, onChange: (value: number) => void) => ({
            kind: "slider" as const,
            label,
            value,
            min: 8,
            max: 16,
            step: 1,
            onChange: (newValue: number) => {
                onChange(newValue);
                refresh();
            },
        });
        return {
            title: "QUANTIZE ATTRIBUTES",
            properties: [
                bitSlider("Position bits", quantize.positionBits, (value) => (quantize.positionBits = value)),
                bitSlider("Normal bits", quantize.normalBits, (value) => (quantize.normalBits = value)),
                bitSlider("Texture-coordinate bits", quantize.textureCoordinateBits, (value) => (quantize.textureCoordinateBits = value)),
                bitSlider("Color bits", quantize.colorBits, (value) => (quantize.colorBits = value)),
                bitSlider("Weight bits", quantize.weightBits, (value) => (quantize.weightBits = value)),
                bitSlider("Generic bits", quantize.genericBits, (value) => (quantize.genericBits = value)),
                {
                    kind: "switch",
                    label: "Normalize weights",
                    value: quantize.normalizeWeights,
                    onChange: (value) => {
                        quantize.normalizeWeights = value;
                        refresh();
                    },
                },
                {
                    kind: "text",
                    label: "Attribute pattern",
                    value: quantize.attributePattern,
                    validator: IsValidPattern,
                    validateOnlyOnBlur: true,
                    onChange: (value) => {
                        quantize.attributePattern = value;
                        refresh();
                    },
                },
                {
                    kind: "text",
                    label: "Morph-target pattern",
                    value: quantize.morphTargetPattern,
                    validator: IsValidPattern,
                    validateOnlyOnBlur: true,
                    onChange: (value) => {
                        quantize.morphTargetPattern = value;
                        refresh();
                    },
                },
                {
                    kind: "dropdown",
                    label: "Quantization volume",
                    value: QuantizationVolumeToLabel(quantize.quantizationVolume),
                    options: QuantizationVolumeLabels,
                    onChange: (value) => {
                        quantize.quantizationVolume = QuantizationVolumeFromLabel(value);
                        refresh();
                    },
                },
                {
                    kind: "switch",
                    label: "Cleanup",
                    value: quantize.cleanup,
                    onChange: (value) => {
                        quantize.cleanup = value;
                        refresh();
                    },
                },
            ],
        };
    },
});
