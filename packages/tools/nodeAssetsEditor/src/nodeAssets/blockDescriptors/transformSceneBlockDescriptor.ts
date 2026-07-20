import { TransformSceneBlock, type SceneUnits, type SceneUpAxis } from "node-assets/Blocks/transformSceneBlock";

import { OperatorHeaderColor, RegisterBlockDescriptor, StructureFamily, UniversalCategory } from "../blockCatalog";

const UnitsOptions: readonly SceneUnits[] = ["meters", "centimeters", "millimeters", "inches", "feet"];
const UpAxisOptions: readonly SceneUpAxis[] = ["X", "Y", "Z"];

RegisterBlockDescriptor({
    paletteItemId: "transform-scene",
    label: "Transform Scene",
    description: "Normalize source coordinates, then apply an authored scale and rotation.",
    keywords: ["units", "scale", "rotation", "up axis", "coordinates"],
    headerColor: OperatorHeaderColor,
    category: UniversalCategory,
    family: StructureFamily,
    className: TransformSceneBlock.ClassName,
    create: (nodeAsset) => new TransformSceneBlock("Transform Scene", nodeAsset),
    getPropertySection: (block, { refresh }) => {
        const transform = block as TransformSceneBlock;
        return {
            title: "TRANSFORM SCENE",
            properties: [
                {
                    kind: "dropdown",
                    label: "Units",
                    value: transform.units,
                    options: UnitsOptions,
                    onChange: (value) => {
                        transform.units = value as SceneUnits;
                        refresh();
                    },
                },
                {
                    kind: "vector3",
                    label: "Scale",
                    value: transform.scale,
                    step: 0.1,
                    onChange: (value) => {
                        transform.scale = value;
                        refresh();
                    },
                },
                {
                    kind: "vector3",
                    label: "Rotation",
                    value: transform.rotation,
                    step: 1,
                    unit: "°",
                    onChange: (value) => {
                        transform.rotation = value;
                        refresh();
                    },
                },
                {
                    kind: "dropdown",
                    label: "Up axis",
                    value: transform.upAxis,
                    options: UpAxisOptions,
                    onChange: (value) => {
                        transform.upAxis = value as SceneUpAxis;
                        refresh();
                    },
                },
            ],
        };
    },
});
