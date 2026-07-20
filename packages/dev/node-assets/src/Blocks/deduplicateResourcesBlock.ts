import { AggregateBlock } from "../blockFoundation/aggregateBlock";
import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { type NodeAsset } from "../nodeAsset";
import { DeduplicateDataBlock } from "./deduplicateDataBlock";
import { DeduplicateMaterialsBlock } from "./deduplicateMaterialsBlock";
import { DeduplicateTexturesBlock } from "./deduplicateTexturesBlock";
import { ReuseIdenticalMeshesBlock } from "./reuseIdenticalMeshesBlock";

/** Built-in aggregate for the common Universal resource deduplication workflow. */
export class DeduplicateResourcesBlock extends AggregateBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "DeduplicateResourcesBlock";

    /** The aggregate's Universal input. */
    public readonly input: NodeAssetConnectionPoint;
    /** The aggregate's Universal output. */
    public readonly output: NodeAssetConnectionPoint;

    /**
     * Creates the ordered Deduplicate Resources aggregate.
     * @param name The display name.
     * @param nodeAsset The owning graph.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        const materials = new DeduplicateMaterialsBlock("Deduplicate Materials", this.subgraph);
        const textures = new DeduplicateTexturesBlock("Deduplicate Textures", this.subgraph);
        const meshes = new ReuseIdenticalMeshesBlock("Reuse Identical Meshes", this.subgraph);
        const data = new DeduplicateDataBlock("Deduplicate Data", this.subgraph);
        materials.output.connectTo(textures.input);
        textures.output.connectTo(meshes.input);
        meshes.output.connectTo(data.input);
        this.input = this._exposeInput(materials.input, "input");
        this.output = this._exposeOutput(data.output, "output");
    }

    /** The owned Deduplicate Materials primitive. */
    public get deduplicateMaterialsBlock(): DeduplicateMaterialsBlock {
        return this._getChildBlock(DeduplicateMaterialsBlock);
    }

    /** The owned Deduplicate Textures primitive. */
    public get deduplicateTexturesBlock(): DeduplicateTexturesBlock {
        return this._getChildBlock(DeduplicateTexturesBlock);
    }

    /** The owned Reuse Identical Meshes primitive. */
    public get reuseIdenticalMeshesBlock(): ReuseIdenticalMeshesBlock {
        return this._getChildBlock(ReuseIdenticalMeshesBlock);
    }

    /** The owned Deduplicate Data primitive. */
    public get deduplicateDataBlock(): DeduplicateDataBlock {
        return this._getChildBlock(DeduplicateDataBlock);
    }

    private _getChildBlock<T extends DeduplicateMaterialsBlock | DeduplicateTexturesBlock | ReuseIdenticalMeshesBlock | DeduplicateDataBlock>(
        blockType: abstract new (...args: never[]) => T
    ): T {
        const block = this.subgraph.attachedBlocks.find((candidate): candidate is T => candidate instanceof blockType);
        if (!block) {
            throw new Error(`The "${this.name}" aggregate has no ${blockType.ClassName}.`);
        }
        return block;
    }
}

RegisterBlock(DeduplicateResourcesBlock.ClassName, (name, nodeAsset) => new DeduplicateResourcesBlock(name, nodeAsset));
