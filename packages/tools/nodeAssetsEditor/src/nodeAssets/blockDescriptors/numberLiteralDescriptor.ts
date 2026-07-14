import { NumberLiteral } from "node-assets/Blocks/numberLiteral";

import { RegisterBlockDescriptor, ValuesCategory, ValuesHeaderColor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "number-literal",
    label: "Number",
    description: "Provide a reusable numeric value to another block.",
    keywords: ["literal", "constant", "scalar", "value"],
    headerColor: ValuesHeaderColor,
    category: ValuesCategory,
    className: NumberLiteral.ClassName,
    create: (nodeAsset) => new NumberLiteral("Number", nodeAsset),
    getPropertySection: (block, { refresh }) => {
        const literal = block as NumberLiteral;
        return {
            title: "NUMBER",
            properties: [
                {
                    kind: "text",
                    label: "Value",
                    value: String(literal.value),
                    validator: (value) => value.trim() !== "" && Number.isFinite(Number(value)),
                    validateOnlyOnBlur: true,
                    onChange: (value) => {
                        literal.value = Number(value);
                        refresh();
                    },
                },
            ],
        };
    },
});
