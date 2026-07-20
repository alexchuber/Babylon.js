import { FlipImageBlock, type FlipAxis } from "node-assets/Blocks/flipImageBlock";

import { ImageCategory, ImageHeaderColor, RegisterBlockDescriptor } from "../blockCatalog";

const AxisOptions: readonly FlipAxis[] = ["horizontal", "vertical"];

RegisterBlockDescriptor({
    paletteItemId: "flip-image",
    label: "Flip Image",
    description: "Mirror an image horizontally or vertically.",
    keywords: ["mirror", "invert", "horizontal", "vertical"],
    headerColor: ImageHeaderColor,
    category: ImageCategory,
    isPaletteVisible: false,
    className: FlipImageBlock.ClassName,
    create: (nodeAsset) => new FlipImageBlock("Flip Image", nodeAsset),
    getPropertySection: (block, { refresh }) => {
        const flip = block as FlipImageBlock;
        return {
            title: "FLIP IMAGE",
            properties: [
                {
                    kind: "dropdown",
                    label: "Axis",
                    value: flip.axis,
                    options: AxisOptions,
                    onChange: (value) => {
                        flip.axis = value as FlipAxis;
                        refresh();
                    },
                },
            ],
        };
    },
});
