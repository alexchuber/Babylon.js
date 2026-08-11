import { DracoCompressionBlock, DracoEncoderMethod } from "node-assets/Blocks/dracoCompressionBlock";

import { EncodingOutputFamily, GltfCategory, RegisterBlockDescriptor } from "../blockCatalog";

// Data-driven node header color for the Draco compression block.
const DracoHeaderColor = "#6f5b9e";

const DracoMethodLabels = ["Edgebreaker", "Sequential"] as const;
const QuantizationVolumeLabels = ["Mesh", "Scene", "Custom bounds"] as const;
const DefaultQuantizationBits = {
    POSITION: 14,
    NORMAL: 10,
    COLOR: 8,
    TEX_COORD: 12,
    GENERIC: 12,
} as const;
type DracoMethodLabel = (typeof DracoMethodLabels)[number];

function DracoMethodToLabel(method: DracoEncoderMethod): DracoMethodLabel {
    return method === DracoEncoderMethod.Sequential ? "Sequential" : "Edgebreaker";
}

function DracoMethodFromLabel(label: string): DracoEncoderMethod {
    return label === "Sequential" ? DracoEncoderMethod.Sequential : DracoEncoderMethod.Edgebreaker;
}

function GetQuantizationBits(block: DracoCompressionBlock, semantic: keyof typeof DefaultQuantizationBits): number {
    return block.quantizationBits?.[semantic] ?? DefaultQuantizationBits[semantic];
}

function SetQuantizationBits(block: DracoCompressionBlock, semantic: keyof typeof DefaultQuantizationBits, value: number): void {
    block.quantizationBits = { ...DefaultQuantizationBits, ...block.quantizationBits, [semantic]: value };
}

function QuantizationVolumeToLabel(block: DracoCompressionBlock): (typeof QuantizationVolumeLabels)[number] {
    return block.quantizationVolume === "custom" ? "Custom bounds" : block.quantizationVolume === "scene" ? "Scene" : "Mesh";
}

function QuantizationVolumeFromLabel(label: string): DracoCompressionBlock["quantizationVolume"] {
    return label === "Custom bounds" ? "custom" : label === "Scene" ? "scene" : "mesh";
}

function SerializeBounds(bounds: readonly number[]): string {
    return bounds.join(", ");
}

function IsValidBounds(value: string): boolean {
    const parts = value.split(",").map((part) => Number(part.trim()));
    return parts.length === 3 && parts.every(Number.isFinite);
}

function ParseBounds(value: string): [number, number, number] {
    return value.split(",").map((part) => Number(part.trim())) as [number, number, number];
}

RegisterBlockDescriptor({
    paletteItemId: "draco-compression",
    label: "Compress Geometry (Draco)",
    description: "Compress mesh geometry with Draco during glTF export.",
    keywords: ["compress", "mesh compression", "geometry", "KHR_draco_mesh_compression"],
    headerColor: DracoHeaderColor,
    category: GltfCategory,
    family: EncodingOutputFamily,
    className: DracoCompressionBlock.ClassName,
    create: (nodeAsset) => new DracoCompressionBlock("Compress Geometry (Draco)", nodeAsset),
    getPropertySection: (block, { refresh }) => {
        const dracoBlock = block as DracoCompressionBlock;
        return {
            title: "DRACO",
            properties: [
                {
                    kind: "dropdown",
                    label: "Method",
                    value: DracoMethodToLabel(dracoBlock.method),
                    options: DracoMethodLabels,
                    onChange: (value) => {
                        dracoBlock.method = DracoMethodFromLabel(value);
                        refresh();
                    },
                },
                {
                    kind: "slider",
                    label: "Encode speed",
                    value: dracoBlock.encodeSpeed,
                    min: 0,
                    max: 10,
                    step: 1,
                    onChange: (value) => {
                        dracoBlock.encodeSpeed = value;
                        refresh();
                    },
                },
                {
                    kind: "slider",
                    label: "Decode speed",
                    value: dracoBlock.decodeSpeed,
                    min: 0,
                    max: 10,
                    step: 1,
                    onChange: (value) => {
                        dracoBlock.decodeSpeed = value;
                        refresh();
                    },
                },
                {
                    kind: "slider",
                    label: "Position bits",
                    value: GetQuantizationBits(dracoBlock, "POSITION"),
                    min: 1,
                    max: 30,
                    step: 1,
                    onChange: (value) => {
                        SetQuantizationBits(dracoBlock, "POSITION", value);
                        refresh();
                    },
                },
                {
                    kind: "slider",
                    label: "Normal bits",
                    value: GetQuantizationBits(dracoBlock, "NORMAL"),
                    min: 1,
                    max: 30,
                    step: 1,
                    onChange: (value) => {
                        SetQuantizationBits(dracoBlock, "NORMAL", value);
                        refresh();
                    },
                },
                {
                    kind: "slider",
                    label: "Color bits",
                    value: GetQuantizationBits(dracoBlock, "COLOR"),
                    min: 1,
                    max: 30,
                    step: 1,
                    onChange: (value) => {
                        SetQuantizationBits(dracoBlock, "COLOR", value);
                        refresh();
                    },
                },
                {
                    kind: "slider",
                    label: "Texture coordinate bits",
                    value: GetQuantizationBits(dracoBlock, "TEX_COORD"),
                    min: 1,
                    max: 30,
                    step: 1,
                    onChange: (value) => {
                        SetQuantizationBits(dracoBlock, "TEX_COORD", value);
                        refresh();
                    },
                },
                {
                    kind: "slider",
                    label: "Generic bits",
                    value: GetQuantizationBits(dracoBlock, "GENERIC"),
                    min: 1,
                    max: 30,
                    step: 1,
                    onChange: (value) => {
                        SetQuantizationBits(dracoBlock, "GENERIC", value);
                        refresh();
                    },
                },
                {
                    kind: "dropdown",
                    label: "Quantization volume",
                    value: QuantizationVolumeToLabel(dracoBlock),
                    options: QuantizationVolumeLabels,
                    onChange: (value) => {
                        dracoBlock.quantizationVolume = QuantizationVolumeFromLabel(value);
                        refresh();
                    },
                },
                {
                    kind: "text",
                    label: "Custom bounds minimum",
                    value: SerializeBounds(dracoBlock.customBoundsMin),
                    validator: IsValidBounds,
                    validateOnlyOnBlur: true,
                    onChange: (value) => {
                        dracoBlock.customBoundsMin = ParseBounds(value);
                        refresh();
                    },
                },
                {
                    kind: "text",
                    label: "Custom bounds maximum",
                    value: SerializeBounds(dracoBlock.customBoundsMax),
                    validator: IsValidBounds,
                    validateOnlyOnBlur: true,
                    onChange: (value) => {
                        dracoBlock.customBoundsMax = ParseBounds(value);
                        refresh();
                    },
                },
                {
                    kind: "text",
                    label: "Compatibility",
                    value: dracoBlock.getCompatibilitySummary(),
                    disabled: true,
                    onChange: () => undefined,
                },
            ],
        };
    },
});
