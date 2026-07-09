import { DracoCompressionBlock, DracoEncoderMethod } from "node-assets/Blocks/dracoCompressionBlock";

import { RegisterBlockDescriptor } from "../blockCatalog";

// Data-driven node header color for the Draco compression block.
const DracoHeaderColor = "#6f5b9e";

const DracoMethodLabels = ["Edgebreaker", "Sequential"] as const;
type DracoMethodLabel = (typeof DracoMethodLabels)[number];

function DracoMethodToLabel(method: DracoEncoderMethod): DracoMethodLabel {
    return method === DracoEncoderMethod.Sequential ? "Sequential" : "Edgebreaker";
}

function DracoMethodFromLabel(label: string): DracoEncoderMethod {
    return label === "Sequential" ? DracoEncoderMethod.Sequential : DracoEncoderMethod.Edgebreaker;
}

function SerializeQuantizationBits(quantizationBits: Record<string, number> | null): string {
    return quantizationBits ? JSON.stringify(quantizationBits) : "";
}

function IsValidQuantizationBitsJson(value: string): boolean {
    const trimmed = value.trim();
    if (!trimmed) {
        return true;
    }
    try {
        const parsed = JSON.parse(trimmed) as unknown;
        return (
            typeof parsed === "object" &&
            parsed !== null &&
            !Array.isArray(parsed) &&
            Object.values(parsed).every((entry) => typeof entry === "number" && Number.isFinite(entry) && Number.isInteger(entry) && entry > 0)
        );
    } catch {
        return false;
    }
}

function ParseQuantizationBits(value: string): Record<string, number> | null {
    const trimmed = value.trim();
    return trimmed ? (JSON.parse(trimmed) as Record<string, number>) : null;
}

RegisterBlockDescriptor({
    paletteItemId: "draco-compression",
    label: "Draco Compression",
    headerColor: DracoHeaderColor,
    className: DracoCompressionBlock.ClassName,
    create: (nodeAsset) => new DracoCompressionBlock("Draco Compression", nodeAsset),
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
                    kind: "text",
                    label: "Quantization bits",
                    value: SerializeQuantizationBits(dracoBlock.quantizationBits),
                    validator: IsValidQuantizationBitsJson,
                    validateOnlyOnBlur: true,
                    onChange: (value) => {
                        dracoBlock.quantizationBits = ParseQuantizationBits(value);
                        refresh();
                    },
                },
            ],
        };
    },
});
