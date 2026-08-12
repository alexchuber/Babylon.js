import { CenterSceneBlock, type CenterScenePivot } from "node-assets/Blocks/centerSceneBlock";

import { TransformHeaderColor, RegisterBlockDescriptor, StructureFamily, UniversalCategory } from "../blockCatalog";

const PivotOptions: readonly CenterScenePivot[] = ["center", "above", "below", "custom-point"];

RegisterBlockDescriptor({
    paletteItemId: "center-scene",
    label: "Center Scene",
    description: "Place a bounds-derived or custom scene pivot at the origin.",
    keywords: ["origin", "pivot", "bounds", "custom point", "recenter"],
    headerColor: TransformHeaderColor,
    category: UniversalCategory,
    family: StructureFamily,
    className: CenterSceneBlock.ClassName,
    create: (nodeAsset) => new CenterSceneBlock("Center Scene", nodeAsset),
    getPropertySection: (block, { refresh }) => {
        const center = block as CenterSceneBlock;
        return {
            title: "CENTER SCENE",
            properties: [
                {
                    kind: "dropdown",
                    label: "Pivot",
                    value: center.pivot,
                    options: PivotOptions,
                    onChange: (value) => {
                        center.pivot = value as CenterScenePivot;
                        refresh();
                    },
                },
                {
                    kind: "vector3",
                    label: "Custom point",
                    value: center.customPoint,
                    step: 0.1,
                    onChange: (value) => {
                        center.customPoint = value;
                        refresh();
                    },
                },
            ],
        };
    },
});
