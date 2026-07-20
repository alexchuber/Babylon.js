import { KTX2CompressionBlock } from "node-assets/Blocks/ktx2CompressionBlock";

import { ConfigureBlockForEditor, EncodingOutputFamily, RegisterBlockDescriptor } from "../blockCatalog";

// Data-driven node header color for the KTX2 compression block.
const CompressionHeaderColor = "#7d5aa8";
const OutputContainerLabels = ["KTX2", "Basis"] as const;
const HDRSourceTypeLabels = ["HDR", "EXR", "Raster"] as const;

function IsValidRegularExpression(value: string): boolean {
    if (!value.trim()) {
        return true;
    }
    try {
        new RegExp(value);
        return true;
    } catch {
        return false;
    }
}

function IsValidMetadata(value: string): boolean {
    try {
        const parsed = JSON.parse(value) as unknown;
        return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) && Object.values(parsed).every((entry) => typeof entry === "string");
    } catch {
        return false;
    }
}

function ParseMetadata(value: string): Record<string, string> {
    return JSON.parse(value) as Record<string, string>;
}

RegisterBlockDescriptor({
    paletteItemId: "ktx2-compression",
    label: "Compress Textures (KTX2)",
    description: "Compress scene textures to KTX2 / Basis Universal.",
    keywords: ["compress", "texture compression", "Basis", "UASTC", "ETC1S"],
    headerColor: CompressionHeaderColor,
    category: "glTF",
    family: EncodingOutputFamily,
    className: KTX2CompressionBlock.ClassName,
    create: (nodeAsset) => ConfigureBlockForEditor(new KTX2CompressionBlock("Compress Textures (KTX2)", nodeAsset)),
    getPropertySection: (block, { refresh }) => {
        const ktx2Block = block as KTX2CompressionBlock;
        return {
            title: "KTX2",
            properties: [
                {
                    kind: "switch",
                    label: "Generate mipmaps",
                    value: ktx2Block.generateMipmaps,
                    onChange: (value) => {
                        ktx2Block.generateMipmaps = value;
                        refresh();
                    },
                },
                {
                    kind: "text",
                    label: "Texture filter",
                    value: ktx2Block.texturePattern ?? "",
                    validator: IsValidRegularExpression,
                    validateOnlyOnBlur: true,
                    onChange: (value) => {
                        ktx2Block.texturePattern = value.trim() || null;
                        refresh();
                    },
                },
                {
                    kind: "text",
                    label: "Color slot filter",
                    value: ktx2Block.colorTextureSlots,
                    validator: IsValidRegularExpression,
                    validateOnlyOnBlur: true,
                    onChange: (value) => {
                        ktx2Block.colorTextureSlots = value;
                        refresh();
                    },
                },
                {
                    kind: "text",
                    label: "Data slot filter",
                    value: ktx2Block.dataTextureSlots,
                    validator: IsValidRegularExpression,
                    validateOnlyOnBlur: true,
                    onChange: (value) => {
                        ktx2Block.dataTextureSlots = value;
                        refresh();
                    },
                },
                {
                    kind: "dropdown",
                    label: "Output container",
                    value: ktx2Block.outputContainer === "ktx2" ? "KTX2" : "Basis",
                    options: OutputContainerLabels,
                    onChange: (value) => {
                        ktx2Block.outputContainer = value === "Basis" ? "basis" : "ktx2";
                        refresh();
                    },
                },
                {
                    kind: "slider",
                    label: "ETC1S quality",
                    value: ktx2Block.etc1sQualityLevel,
                    min: 1,
                    max: 255,
                    step: 1,
                    onChange: (value) => {
                        ktx2Block.etc1sQualityLevel = value;
                        refresh();
                    },
                },
                {
                    kind: "slider",
                    label: "ETC1S compression level",
                    value: ktx2Block.etc1sCompressionLevel,
                    min: 0,
                    max: 6,
                    step: 1,
                    onChange: (value) => {
                        ktx2Block.etc1sCompressionLevel = value;
                        refresh();
                    },
                },
                {
                    kind: "slider",
                    label: "UASTC quality",
                    value: ktx2Block.uastcQualityLevel,
                    min: 0,
                    max: 3,
                    step: 1,
                    onChange: (value) => {
                        ktx2Block.uastcQualityLevel = value;
                        refresh();
                    },
                },
                {
                    kind: "switch",
                    label: "Color perceptual metric",
                    value: ktx2Block.colorPerceptual,
                    onChange: (value) => {
                        ktx2Block.colorPerceptual = value;
                        refresh();
                    },
                },
                {
                    kind: "switch",
                    label: "Data perceptual metric",
                    value: ktx2Block.dataPerceptual,
                    onChange: (value) => {
                        ktx2Block.dataPerceptual = value;
                        refresh();
                    },
                },
                {
                    kind: "switch",
                    label: "Color sRGB transfer function",
                    value: ktx2Block.colorSRGBTransferFunction,
                    onChange: (value) => {
                        ktx2Block.colorSRGBTransferFunction = value;
                        refresh();
                    },
                },
                {
                    kind: "switch",
                    label: "Data sRGB transfer function",
                    value: ktx2Block.dataSRGBTransferFunction,
                    onChange: (value) => {
                        ktx2Block.dataSRGBTransferFunction = value;
                        refresh();
                    },
                },
                {
                    kind: "switch",
                    label: "UASTC RDO",
                    value: ktx2Block.enableRDO,
                    onChange: (value) => {
                        ktx2Block.enableRDO = value;
                        refresh();
                    },
                },
                {
                    kind: "slider",
                    label: "RDO quality",
                    value: ktx2Block.rdoQualityLevel,
                    min: 0,
                    max: 10,
                    step: 0.001,
                    onChange: (value) => {
                        ktx2Block.rdoQualityLevel = value;
                        refresh();
                    },
                },
                {
                    kind: "switch",
                    label: "Zstandard supercompression",
                    value: ktx2Block.useZstandard,
                    onChange: (value) => {
                        ktx2Block.useZstandard = value;
                        refresh();
                    },
                },
                {
                    kind: "switch",
                    label: "Normal map tuning",
                    value: ktx2Block.normalMapTuning,
                    onChange: (value) => {
                        ktx2Block.normalMapTuning = value;
                        refresh();
                    },
                },
                {
                    kind: "switch",
                    label: "Flip Y",
                    value: ktx2Block.flipY,
                    onChange: (value) => {
                        ktx2Block.flipY = value;
                        refresh();
                    },
                },
                {
                    kind: "switch",
                    label: "HDR",
                    value: ktx2Block.hdr,
                    onChange: (value) => {
                        ktx2Block.hdr = value;
                        refresh();
                    },
                },
                {
                    kind: "dropdown",
                    label: "HDR source type",
                    value: ktx2Block.hdrSourceType === "exr" ? "EXR" : ktx2Block.hdrSourceType === "raster" ? "Raster" : "HDR",
                    options: HDRSourceTypeLabels,
                    onChange: (value) => {
                        ktx2Block.hdrSourceType = value === "EXR" ? "exr" : value === "Raster" ? "raster" : "hdr";
                        refresh();
                    },
                },
                {
                    kind: "slider",
                    label: "HDR quality",
                    value: ktx2Block.hdrQualityLevel,
                    min: 0,
                    max: 4,
                    step: 1,
                    onChange: (value) => {
                        ktx2Block.hdrQualityLevel = value;
                        refresh();
                    },
                },
                {
                    kind: "text",
                    label: "Metadata",
                    value: JSON.stringify(ktx2Block.metadata),
                    validator: IsValidMetadata,
                    validateOnlyOnBlur: true,
                    onChange: (value) => {
                        ktx2Block.metadata = ParseMetadata(value);
                        refresh();
                    },
                },
                {
                    kind: "switch",
                    label: "Debug output",
                    value: ktx2Block.enableDebug,
                    onChange: (value) => {
                        ktx2Block.enableDebug = value;
                        refresh();
                    },
                },
                {
                    kind: "text",
                    label: "Encoder JavaScript URL",
                    value: ktx2Block.jsUrl ?? "",
                    onChange: (value) => {
                        ktx2Block.jsUrl = value.trim() || undefined;
                        refresh();
                    },
                },
                {
                    kind: "text",
                    label: "Encoder WASM URL",
                    value: ktx2Block.wasmUrl ?? "",
                    onChange: (value) => {
                        ktx2Block.wasmUrl = value.trim() || undefined;
                        refresh();
                    },
                },
                {
                    kind: "text",
                    label: "Compatibility",
                    value: ktx2Block.getCompatibilitySummary(),
                    disabled: true,
                    onChange: () => undefined,
                },
            ],
        };
    },
});
