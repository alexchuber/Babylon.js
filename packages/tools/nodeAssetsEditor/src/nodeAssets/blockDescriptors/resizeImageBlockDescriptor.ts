import { ResizeImageBlock } from "node-assets/Blocks/resizeImageBlock";

import { ImageCategory, ImageHeaderColor, RegisterBlockDescriptor } from "../blockCatalog";

// Slider bounds for the target dimensions: at least one pixel, up to a common max texture size.
const MinDimension = 1;
const MaxDimension = 4096;

RegisterBlockDescriptor({
    paletteItemId: "resize-image",
    label: "Resize Image",
    description: "Scale an image to target pixel dimensions.",
    keywords: ["scale texture", "dimensions", "resolution", "downsample"],
    headerColor: ImageHeaderColor,
    category: ImageCategory,
    isPaletteVisible: false,
    className: ResizeImageBlock.ClassName,
    create: (nodeAsset) => new ResizeImageBlock("Resize Image", nodeAsset),
    getPropertySection: (block, { refresh }) => {
        const resize = block as ResizeImageBlock;
        return {
            title: "RESIZE IMAGE",
            properties: [
                {
                    kind: "slider",
                    label: "Width",
                    value: resize.width,
                    min: MinDimension,
                    max: MaxDimension,
                    step: 1,
                    onChange: (value) => {
                        resize.width = value;
                        refresh();
                    },
                },
                {
                    kind: "slider",
                    label: "Height",
                    value: resize.height,
                    min: MinDimension,
                    max: MaxDimension,
                    step: 1,
                    onChange: (value) => {
                        resize.height = value;
                        refresh();
                    },
                },
            ],
        };
    },
});
