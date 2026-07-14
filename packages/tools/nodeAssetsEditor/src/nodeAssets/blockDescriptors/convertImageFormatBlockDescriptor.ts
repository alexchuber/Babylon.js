import { ConvertImageFormatBlock, type ImageFormat } from "node-assets/Blocks/convertImageFormatBlock";

import { ImageCategory, ImageHeaderColor, RegisterBlockDescriptor } from "../blockCatalog";

const FormatOptions: readonly ImageFormat[] = ["png", "jpeg", "webp"];

RegisterBlockDescriptor({
    paletteItemId: "convert-image-format",
    label: "Convert Image Format",
    description: "Encode an image as PNG, JPEG, or WebP.",
    keywords: ["image conversion", "encode", "PNG", "JPEG", "WebP"],
    headerColor: ImageHeaderColor,
    category: ImageCategory,
    className: ConvertImageFormatBlock.ClassName,
    create: (nodeAsset) => new ConvertImageFormatBlock("Convert Image Format", nodeAsset),
    getPropertySection: (block, { refresh }) => {
        const convert = block as ConvertImageFormatBlock;
        return {
            title: "CONVERT IMAGE FORMAT",
            properties: [
                {
                    kind: "dropdown",
                    label: "Format",
                    value: convert.format,
                    options: FormatOptions,
                    onChange: (value) => {
                        convert.format = value as ImageFormat;
                        refresh();
                    },
                },
                {
                    kind: "slider",
                    label: "Quality",
                    value: convert.quality,
                    min: 0,
                    max: 1,
                    step: 0.05,
                    onChange: (value) => {
                        convert.quality = value;
                        refresh();
                    },
                },
            ],
        };
    },
});
