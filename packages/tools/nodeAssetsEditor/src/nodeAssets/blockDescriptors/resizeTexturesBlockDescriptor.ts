import { ResizeTexturesBlock, type TextureResizeMode } from "node-assets/Blocks/resizeTexturesBlock";

import { OperatorCategory, OperatorHeaderColor, RegisterBlockDescriptor } from "../blockCatalog";

const ResizeModeOptions: readonly TextureResizeMode[] = ["sharp", "smooth"];

RegisterBlockDescriptor({
    paletteItemId: "resize-textures",
    label: "Resize Textures",
    description: "Reduce texture dimensions inside Universal content.",
    keywords: ["texture", "dimensions", "resolution", "downsample"],
    headerColor: OperatorHeaderColor,
    category: OperatorCategory,
    className: ResizeTexturesBlock.ClassName,
    create: (nodeAsset) => new ResizeTexturesBlock("Resize Textures", nodeAsset),
    getPropertySection: (block, { refresh }) => {
        const resize = block as ResizeTexturesBlock;
        return {
            title: "RESIZE TEXTURES",
            properties: [
                {
                    kind: "slider",
                    label: "Maximum width",
                    value: resize.maximumWidth,
                    min: 1,
                    max: 16384,
                    step: 1,
                    onChange: (value) => {
                        resize.maximumWidth = value;
                        refresh();
                    },
                },
                {
                    kind: "slider",
                    label: "Maximum height",
                    value: resize.maximumHeight,
                    min: 1,
                    max: 16384,
                    step: 1,
                    onChange: (value) => {
                        resize.maximumHeight = value;
                        refresh();
                    },
                },
                {
                    kind: "dropdown",
                    label: "Resize mode",
                    value: resize.resizeMode,
                    options: ResizeModeOptions,
                    onChange: (value) => {
                        resize.resizeMode = value as TextureResizeMode;
                        refresh();
                    },
                },
            ],
        };
    },
});
