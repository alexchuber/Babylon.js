import { QuantizeBlock } from "node-assets/Blocks/quantizeBlock";

import { OperatorCategory, OperatorHeaderColor, RegisterBlockDescriptor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "quantize",
    label: "Quantize",
    description: "Reduce vertex attribute precision to shrink scene data.",
    keywords: ["optimize", "compress", "precision", "mesh size"],
    headerColor: OperatorHeaderColor,
    category: OperatorCategory,
    className: QuantizeBlock.ClassName,
    create: (nodeAsset) => new QuantizeBlock("Quantize", nodeAsset),
    getPropertySection: (block, { refresh }) => {
        const quantize = block as QuantizeBlock;
        return {
            title: "QUANTIZE",
            properties: [
                {
                    kind: "slider",
                    label: "Position bits",
                    value: quantize.quantizePosition,
                    min: 1,
                    max: 16,
                    step: 1,
                    onChange: (value) => {
                        quantize.quantizePosition = value;
                        refresh();
                    },
                },
                {
                    kind: "slider",
                    label: "Normal bits",
                    value: quantize.quantizeNormal,
                    min: 1,
                    max: 16,
                    step: 1,
                    onChange: (value) => {
                        quantize.quantizeNormal = value;
                        refresh();
                    },
                },
                {
                    kind: "slider",
                    label: "Texcoord bits",
                    value: quantize.quantizeTexcoord,
                    min: 1,
                    max: 16,
                    step: 1,
                    onChange: (value) => {
                        quantize.quantizeTexcoord = value;
                        refresh();
                    },
                },
            ],
        };
    },
});
