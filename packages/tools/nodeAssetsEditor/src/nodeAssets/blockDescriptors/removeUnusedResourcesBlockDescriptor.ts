import { RemovableResourcePropertyTypes, type RemovableResourcePropertyType, RemoveUnusedResourcesBlock } from "node-assets/Blocks/removeUnusedResourcesBlock";

import { CleanupFamily, TransformHeaderColor, RegisterBlockDescriptor, UniversalCategory } from "../blockCatalog";

function SerializeKeptPropertyTypes(propertyTypes: readonly RemovableResourcePropertyType[]): string {
    return propertyTypes.join(", ");
}

function ParseKeptPropertyTypes(value: string): RemovableResourcePropertyType[] {
    const propertyTypeByLowerCase = new Map(RemovableResourcePropertyTypes.map((propertyType) => [propertyType.toLowerCase(), propertyType]));
    const parsed: RemovableResourcePropertyType[] = [];
    for (const token of value.split(",")) {
        const trimmed = token.trim();
        if (!trimmed) {
            continue;
        }
        const propertyType = propertyTypeByLowerCase.get(trimmed.toLowerCase());
        if (propertyType && !parsed.includes(propertyType)) {
            parsed.push(propertyType);
        }
    }
    return parsed;
}

function IsValidKeptPropertyTypes(value: string): boolean {
    const parsed = ParseKeptPropertyTypes(value);
    const tokens = value
        .split(",")
        .map((token) => token.trim())
        .filter(Boolean);
    return parsed.length === tokens.length;
}

RegisterBlockDescriptor({
    paletteItemId: "remove-unused-resources",
    label: "Remove Unused Resources",
    description: "Remove resources that are no longer referenced by the scene.",
    keywords: ["prune", "unused", "orphaned", "resources", "cleanup"],
    headerColor: TransformHeaderColor,
    category: UniversalCategory,
    family: CleanupFamily,
    className: RemoveUnusedResourcesBlock.ClassName,
    create: (nodeAsset) => new RemoveUnusedResourcesBlock("Remove Unused Resources", nodeAsset),
    getPropertySection: (block, { refresh }) => {
        const removeUnused = block as RemoveUnusedResourcesBlock;
        return {
            title: "REMOVE UNUSED RESOURCES",
            properties: [
                {
                    kind: "text",
                    label: "Kept property types",
                    value: SerializeKeptPropertyTypes(removeUnused.keptPropertyTypes),
                    validator: IsValidKeptPropertyTypes,
                    validateOnlyOnBlur: true,
                    onChange: (value) => {
                        removeUnused.keptPropertyTypes = ParseKeptPropertyTypes(value);
                        refresh();
                    },
                },
                {
                    kind: "switch",
                    label: "Keep leaf nodes",
                    value: removeUnused.keepLeafNodes,
                    onChange: (value) => {
                        removeUnused.keepLeafNodes = value;
                        refresh();
                    },
                },
                {
                    kind: "switch",
                    label: "Keep attributes",
                    value: removeUnused.keepAttributes,
                    onChange: (value) => {
                        removeUnused.keepAttributes = value;
                        refresh();
                    },
                },
                {
                    kind: "switch",
                    label: "Keep solid textures",
                    value: removeUnused.keepSolidTextures,
                    onChange: (value) => {
                        removeUnused.keepSolidTextures = value;
                        refresh();
                    },
                },
                {
                    kind: "switch",
                    label: "Keep extras",
                    value: removeUnused.keepExtras,
                    onChange: (value) => {
                        removeUnused.keepExtras = value;
                        refresh();
                    },
                },
            ],
        };
    },
});
