import { StripAttributesBlock, UniversalAttributeKind } from "node-assets/Blocks/stripAttributesBlock";

import { AttributesFamily, OperatorHeaderColor, RegisterBlockDescriptor, UniversalCategory } from "../blockCatalog";

const AttributeKindOptions = [
    { kind: UniversalAttributeKind.Normal, label: "Normals" },
    { kind: UniversalAttributeKind.Tangent, label: "Tangents" },
    { kind: UniversalAttributeKind.TextureCoordinate, label: "Texture coordinates" },
    { kind: UniversalAttributeKind.Color, label: "Colors" },
    { kind: UniversalAttributeKind.Joints, label: "Joints" },
    { kind: UniversalAttributeKind.Weights, label: "Weights" },
] as const;

RegisterBlockDescriptor({
    paletteItemId: "strip-attributes",
    label: "Strip Attributes",
    description: "Remove selected vertex attribute kinds.",
    keywords: ["attributes", "remove", "normals", "tangents", "texture coordinates", "colors", "joints", "weights"],
    headerColor: OperatorHeaderColor,
    category: UniversalCategory,
    family: AttributesFamily,
    className: StripAttributesBlock.ClassName,
    create: (nodeAsset) => new StripAttributesBlock("Strip Attributes", nodeAsset),
    getPropertySection: (block, { refresh }) => {
        const strip = block as StripAttributesBlock;
        return {
            title: "STRIP ATTRIBUTES",
            properties: AttributeKindOptions.map(({ kind, label }) => ({
                kind: "switch" as const,
                label,
                value: strip.selectedAttributeKinds.includes(kind),
                onChange: (value: boolean) => {
                    const selected = new Set(strip.selectedAttributeKinds);
                    if (value) {
                        selected.add(kind);
                    } else {
                        selected.delete(kind);
                    }
                    strip.selectedAttributeKinds = AttributeKindOptions.map((option) => option.kind).filter((option) => selected.has(option));
                    refresh();
                },
            })),
        };
    },
});
