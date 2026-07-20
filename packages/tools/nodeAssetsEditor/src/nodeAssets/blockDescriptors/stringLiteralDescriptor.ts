import { StringLiteral } from "node-assets/Blocks/stringLiteral";

import { RegisterBlockDescriptor, ValuesCategory, ValuesHeaderColor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "string-literal",
    label: "String",
    description: "Provide reusable text to selector or property inputs.",
    keywords: ["text", "literal", "constant", "value"],
    headerColor: ValuesHeaderColor,
    category: ValuesCategory,
    isPaletteVisible: false,
    className: StringLiteral.ClassName,
    create: (nodeAsset) => new StringLiteral("String", nodeAsset),
    getPropertySection: (block, { refresh }) => {
        const literal = block as StringLiteral;
        return {
            title: "STRING",
            properties: [
                {
                    kind: "text",
                    label: "Value",
                    value: literal.value,
                    onChange: (value) => {
                        literal.value = value;
                        refresh();
                    },
                },
            ],
        };
    },
});
