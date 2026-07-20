import { CenterBlock, type CenterPivot } from "node-assets/Blocks/centerBlock";

import { OperatorCategory, OperatorHeaderColor, RegisterBlockDescriptor } from "../blockCatalog";

const PivotOptions: readonly CenterPivot[] = ["center", "above", "below"];

RegisterBlockDescriptor({
    paletteItemId: "center",
    label: "Center",
    description: "Move scene content around a chosen bounds pivot.",
    keywords: ["origin", "pivot", "position", "align", "recenter"],
    headerColor: OperatorHeaderColor,
    category: OperatorCategory,
    isPaletteVisible: false,
    className: CenterBlock.ClassName,
    create: (nodeAsset) => new CenterBlock("Center", nodeAsset),
    getPropertySection: (block, { refresh }) => {
        const center = block as CenterBlock;
        return {
            title: "CENTER",
            properties: [
                {
                    kind: "dropdown",
                    label: "Pivot",
                    value: center.pivot,
                    options: PivotOptions,
                    onChange: (value) => {
                        center.pivot = value as CenterPivot;
                        refresh();
                    },
                },
            ],
        };
    },
});
