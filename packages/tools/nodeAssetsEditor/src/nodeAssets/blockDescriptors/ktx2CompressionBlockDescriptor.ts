import { KTX2CompressionBlock } from "node-assets/Blocks/ktx2CompressionBlock";

import { ConfigureBlockForEditor, GltfCategory, GltfHeaderColor, RegisterBlockDescriptor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "ktx2-compression",
    label: "Apply BasisU",
    description: "Compress scene textures to KTX2 / Basis Universal.",
    keywords: ["compress", "texture compression", "Basis", "UASTC", "ETC1S"],
    headerColor: GltfHeaderColor,
    category: GltfCategory,
    className: KTX2CompressionBlock.ClassName,
    create: (nodeAsset) => ConfigureBlockForEditor(new KTX2CompressionBlock("Apply BasisU", nodeAsset)),
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
            ],
        };
    },
});
