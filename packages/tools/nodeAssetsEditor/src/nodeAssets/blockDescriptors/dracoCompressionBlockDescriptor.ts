import { DracoCompressionBlock } from "node-assets/Blocks/dracoCompressionBlock";

import { RegisterBlockDescriptor } from "../blockCatalog";

// Data-driven node header color for the Draco compression block.
const DracoHeaderColor = "#6f5b9e";

RegisterBlockDescriptor({
    paletteItemId: "draco-compression",
    label: "Draco Compression",
    headerColor: DracoHeaderColor,
    className: DracoCompressionBlock.ClassName,
    create: (nodeAsset) => new DracoCompressionBlock("Draco Compression", nodeAsset),
});
