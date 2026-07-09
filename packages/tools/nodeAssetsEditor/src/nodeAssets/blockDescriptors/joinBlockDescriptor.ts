import { JoinBlock } from "node-assets/Blocks/joinBlock";

import { OperatorCategory, OperatorHeaderColor, RegisterBlockDescriptor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "join",
    label: "Join",
    headerColor: OperatorHeaderColor,
    category: OperatorCategory,
    className: JoinBlock.ClassName,
    create: (nodeAsset) => new JoinBlock("Join", nodeAsset),
    getPropertySection: (block, refresh) => {
        const join = block as JoinBlock;
        return {
            title: "JOIN",
            properties: [
                {
                    kind: "switch",
                    label: "Keep separate meshes",
                    value: join.keepMeshes,
                    onChange: (value) => {
                        join.keepMeshes = value;
                        refresh();
                    },
                },
                {
                    kind: "switch",
                    label: "Keep named nodes",
                    value: join.keepNamed,
                    onChange: (value) => {
                        join.keepNamed = value;
                        refresh();
                    },
                },
            ],
        };
    },
});
