import { Selector } from "node-assets/Blocks/selector";

import { RegisterBlockDescriptor, SelectorsCategory, SelectorsHeaderColor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "selector",
    label: "Selector",
    description: "Address a scene property with a glTF object-model pointer.",
    keywords: ["find", "select", "pointer", "path", "KHR_animation_pointer"],
    headerColor: SelectorsHeaderColor,
    category: SelectorsCategory,
    className: Selector.ClassName,
    create: (nodeAsset) => new Selector("Selector", nodeAsset),
    getPropertySection: (block, { refresh }) => {
        const selector = block as Selector;
        return {
            title: "SELECTOR",
            properties: [
                {
                    kind: "text",
                    label: "Pointer",
                    value: selector.pointer,
                    onChange: (value) => {
                        selector.pointer = value;
                        refresh();
                    },
                },
            ],
        };
    },
});
