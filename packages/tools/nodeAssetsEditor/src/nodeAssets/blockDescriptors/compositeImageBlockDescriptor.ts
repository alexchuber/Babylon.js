import { CompositeImageBlock } from "node-assets/Blocks/compositeImageBlock";

import { ImageCategory, ImageHeaderColor, RegisterBlockDescriptor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "composite-image",
    label: "Composite Image",
    description: "Layer one image over another with an offset.",
    keywords: ["combine images", "overlay", "layer", "texture atlas"],
    headerColor: ImageHeaderColor,
    category: ImageCategory,
    className: CompositeImageBlock.ClassName,
    create: (nodeAsset) => new CompositeImageBlock("Composite Image", nodeAsset),
    getPropertySection: (block, { refresh }) => {
        const composite = block as CompositeImageBlock;
        return {
            title: "COMPOSITE IMAGE",
            properties: [
                {
                    kind: "text",
                    label: "Offset X",
                    value: String(composite.offsetX),
                    // Any finite number, including negatives, so the overlay can be nudged off any edge.
                    validator: (value) => value.trim() !== "" && Number.isFinite(Number(value)),
                    validateOnlyOnBlur: true,
                    onChange: (value) => {
                        composite.offsetX = Number(value);
                        refresh();
                    },
                },
                {
                    kind: "text",
                    label: "Offset Y",
                    value: String(composite.offsetY),
                    // Any finite number, including negatives, so the overlay can be nudged off any edge.
                    validator: (value) => value.trim() !== "" && Number.isFinite(Number(value)),
                    validateOnlyOnBlur: true,
                    onChange: (value) => {
                        composite.offsetY = Number(value);
                        refresh();
                    },
                },
            ],
        };
    },
});
