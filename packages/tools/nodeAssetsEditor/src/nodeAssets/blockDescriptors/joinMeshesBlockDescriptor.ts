import { JoinMeshesBlock } from "node-assets/Blocks/joinMeshesBlock";

import { TransformHeaderColor, RegisterBlockDescriptor, StructureFamily, UniversalCategory } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "join-meshes",
    label: "Join Meshes",
    description: "Join compatible Universal mesh primitives to reduce draw calls.",
    keywords: ["structure", "mesh", "batch", "draw calls"],
    headerColor: TransformHeaderColor,
    category: UniversalCategory,
    family: StructureFamily,
    className: JoinMeshesBlock.ClassName,
    create: (nodeAsset) => new JoinMeshesBlock("Join Meshes", nodeAsset),
    getPropertySection: (block, { refresh }) => {
        const join = block as JoinMeshesBlock;
        return {
            title: "JOIN MESHES",
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
                {
                    kind: "switch",
                    label: "Cleanup",
                    value: join.cleanup,
                    onChange: (value) => {
                        join.cleanup = value;
                        refresh();
                    },
                },
            ],
        };
    },
});
