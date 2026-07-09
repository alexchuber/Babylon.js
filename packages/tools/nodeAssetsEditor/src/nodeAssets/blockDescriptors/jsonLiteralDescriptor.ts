import { JsonLiteral } from "node-assets/Blocks/jsonLiteral";

import { RegisterBlockDescriptor, ValuesCategory, ValuesHeaderColor } from "../blockCatalog";

/**
 * Whether a string parses as JSON, so an invalid edit is displayed but not committed to the block.
 * @param value - The candidate JSON text.
 * @returns True when the text is valid JSON.
 */
function IsValidJson(value: string): boolean {
    try {
        JSON.parse(value);
        return true;
    } catch {
        return false;
    }
}

RegisterBlockDescriptor({
    paletteItemId: "json-literal",
    label: "JSON",
    headerColor: ValuesHeaderColor,
    category: ValuesCategory,
    className: JsonLiteral.ClassName,
    create: (nodeAsset) => new JsonLiteral("JSON", nodeAsset),
    getPropertySection: (block, refresh) => {
        const literal = block as JsonLiteral;
        return {
            title: "JSON",
            properties: [
                {
                    kind: "text",
                    label: "Value",
                    value: JSON.stringify(literal.value ?? null),
                    validator: IsValidJson,
                    validateOnlyOnBlur: true,
                    onChange: (value) => {
                        literal.value = JSON.parse(value);
                        refresh();
                    },
                },
            ],
        };
    },
});
