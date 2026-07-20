import { DeduplicateDataBlock } from "node-assets/Blocks/deduplicateDataBlock";
import { DeduplicateMaterialsBlock } from "node-assets/Blocks/deduplicateMaterialsBlock";
import { DeduplicateResourcesBlock } from "node-assets/Blocks/deduplicateResourcesBlock";
import { DeduplicateTexturesBlock } from "node-assets/Blocks/deduplicateTexturesBlock";
import { ReuseIdenticalMeshesBlock } from "node-assets/Blocks/reuseIdenticalMeshesBlock";
import { type NodeAssetBlock } from "node-assets/blockFoundation/nodeAssetBlock";

import { CleanupFamily, ConfigureBlockForEditor, OperatorHeaderColor, RegisterBlockDescriptor, UniversalCategory, type IPropertySectionContext } from "../blockCatalog";
import { type IPropertySection } from "../../nodeGraph/propertyModel";

const AggregatePaletteItemId = "deduplicate-resources";

function CreateKeepUniqueNamesSection(block: NodeAssetBlock, { refresh }: IPropertySectionContext): IPropertySection {
    if (
        !(block instanceof DeduplicateMaterialsBlock) &&
        !(block instanceof DeduplicateTexturesBlock) &&
        !(block instanceof ReuseIdenticalMeshesBlock) &&
        !(block instanceof DeduplicateDataBlock)
    ) {
        throw new Error(`Expected a deduplication primitive block, received "${block.getClassName()}".`);
    }

    return {
        title: block.name.toUpperCase(),
        properties: [
            {
                kind: "switch" as const,
                label: "Keep unique names",
                value: block.keepUniqueNames,
                onChange: (value: boolean) => {
                    block.keepUniqueNames = value;
                    refresh();
                },
            },
        ],
    };
}

RegisterBlockDescriptor({
    paletteItemId: AggregatePaletteItemId,
    label: "Deduplicate Resources",
    description: "Reuse equivalent materials, textures, mesh resources, accessors, and skins.",
    keywords: ["optimize", "cleanup", "deduplicate", "reduce size"],
    headerColor: OperatorHeaderColor,
    category: UniversalCategory,
    family: CleanupFamily,
    className: DeduplicateResourcesBlock.ClassName,
    create: (nodeAsset) => ConfigureBlockForEditor(new DeduplicateResourcesBlock("Deduplicate Resources", nodeAsset)),
});

RegisterBlockDescriptor({
    paletteItemId: "deduplicate-materials",
    label: "Deduplicate Materials",
    description: "Reuse equivalent material resources.",
    headerColor: OperatorHeaderColor,
    category: UniversalCategory,
    className: DeduplicateMaterialsBlock.ClassName,
    abstractedBy: AggregatePaletteItemId,
    create: (nodeAsset) => ConfigureBlockForEditor(new DeduplicateMaterialsBlock("Deduplicate Materials", nodeAsset)),
    getPropertySection: CreateKeepUniqueNamesSection,
});

RegisterBlockDescriptor({
    paletteItemId: "deduplicate-textures",
    label: "Deduplicate Textures",
    description: "Reuse textures with equivalent image content.",
    headerColor: OperatorHeaderColor,
    category: UniversalCategory,
    className: DeduplicateTexturesBlock.ClassName,
    abstractedBy: AggregatePaletteItemId,
    create: (nodeAsset) => ConfigureBlockForEditor(new DeduplicateTexturesBlock("Deduplicate Textures", nodeAsset)),
    getPropertySection: CreateKeepUniqueNamesSection,
});

RegisterBlockDescriptor({
    paletteItemId: "reuse-identical-meshes",
    label: "Reuse Identical Meshes",
    description: "Share equivalent mesh resources without introducing runtime GPU instancing.",
    headerColor: OperatorHeaderColor,
    category: UniversalCategory,
    className: ReuseIdenticalMeshesBlock.ClassName,
    abstractedBy: AggregatePaletteItemId,
    create: (nodeAsset) => ConfigureBlockForEditor(new ReuseIdenticalMeshesBlock("Reuse Identical Meshes", nodeAsset)),
    getPropertySection: CreateKeepUniqueNamesSection,
});

RegisterBlockDescriptor({
    paletteItemId: "deduplicate-data",
    label: "Deduplicate Data",
    description: "Reuse equivalent accessor and skin data.",
    headerColor: OperatorHeaderColor,
    category: UniversalCategory,
    className: DeduplicateDataBlock.ClassName,
    abstractedBy: AggregatePaletteItemId,
    create: (nodeAsset) => ConfigureBlockForEditor(new DeduplicateDataBlock("Deduplicate Data", nodeAsset)),
    getPropertySection: CreateKeepUniqueNamesSection,
});
