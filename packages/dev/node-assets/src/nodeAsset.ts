import { ExportGLTFBlock } from "./Blocks/exportGLTFBlock";
import { ImportGLTFBlock } from "./Blocks/importGLTFBlock";
import { DracoCompressionBlock } from "./Blocks/dracoCompressionBlock";
import { KTX2CompressionBlock } from "./Blocks/ktx2CompressionBlock";
import { type NodeAssetBlock } from "./blockFoundation/nodeAssetBlock";
import { UniqueIdGenerator } from "./utils/uniqueIdGenerator";

/**
 * Constructs a block from its serialized class name. Kept as a small switch (rather than a
 * registry) while the block set is small.
 * @param customType - The block's serialized class name.
 * @param name - The display name to give the block.
 * @param nodeAsset - The node asset that will own the block.
 * @returns The constructed block.
 */
function CreateBlockByClassName(customType: string, name: string, nodeAsset: NodeAsset): NodeAssetBlock {
    switch (customType) {
        case ImportGLTFBlock.ClassName:
            return new ImportGLTFBlock(name, nodeAsset);
        case DracoCompressionBlock.ClassName:
            return new DracoCompressionBlock(name, nodeAsset);
        case KTX2CompressionBlock.ClassName:
            return new KTX2CompressionBlock(name, nodeAsset);
        case ExportGLTFBlock.ClassName:
            return new ExportGLTFBlock(name, nodeAsset);
        default:
            throw new Error(`Cannot deserialize unknown block type "${customType}".`);
    }
}

/**
 * A node graph of {@link NodeAssetBlock}s. Blocks register themselves with the asset on
 * construction. The graph is run by pulling from the terminal export block.
 */
export class NodeAsset {
    /** The display name of the node asset. */
    public name: string;

    private readonly _attachedBlocks: NodeAssetBlock[] = [];

    /**
     * Creates a new node asset.
     * @param name - The display name of the node asset.
     */
    public constructor(name: string) {
        this.name = name;
    }

    /** The blocks registered with this node asset. */
    public get attachedBlocks(): ReadonlyArray<NodeAssetBlock> {
        return this._attachedBlocks;
    }

    /**
     * Registers a block with this node asset. Called by the block constructor.
     * @param block - The block to register.
     * @internal
     */
    public _registerBlock(block: NodeAssetBlock): void {
        this._attachedBlocks.push(block);
    }

    /**
     * Removes a block from this node asset, disconnecting all of its connection points first.
     * @param block - The block to remove.
     */
    public removeBlock(block: NodeAssetBlock): void {
        const index = this._attachedBlocks.indexOf(block);
        if (index === -1) {
            return;
        }
        for (const input of block.inputs) {
            input.disconnect();
        }
        for (const output of block.outputs) {
            output.disconnect();
        }
        this._attachedBlocks.splice(index, 1);
    }

    /**
     * Serializes the graph (blocks and connections) to a plain, JSON-friendly object.
     * @returns The serialization object.
     */
    public serialize(): any {
        const blocks = this._attachedBlocks.map((block) => block.serialize());

        const connections: any[] = [];
        for (const block of this._attachedBlocks) {
            for (const output of block.outputs) {
                const input = output.connectedPoint;
                if (input) {
                    connections.push({
                        fromBlock: block.uniqueId,
                        fromPoint: output.name,
                        toBlock: input.ownerBlock.uniqueId,
                        toPoint: input.name,
                    });
                }
            }
        }

        return { name: this.name, blocks, connections };
    }

    /**
     * Reconstructs a {@link NodeAsset} from an object produced by {@link serialize}. Blocks are
     * created in serialized order (so `attachedBlocks[i]` corresponds to `blocks[i]`) with their
     * original ids restored, then connections are re-established by block id and point name.
     * @param serializationObject - The serialization object.
     * @returns The reconstructed node asset.
     */
    public static Parse(serializationObject: any): NodeAsset {
        const asset = new NodeAsset(serializationObject.name ?? "nodeAsset");

        const blocksById = new Map<number, NodeAssetBlock>();
        let maxId = 0;
        for (const blockData of serializationObject.blocks ?? []) {
            const block = CreateBlockByClassName(blockData.customType, blockData.name, asset);
            block.uniqueId = blockData.id;
            block._deserialize(blockData);
            blocksById.set(blockData.id, block);
            maxId = Math.max(maxId, blockData.id);
        }
        // Restored ids can exceed the freshly-generated ones assigned in the block constructors above;
        // advance the generator so later blocks cannot collide with them.
        UniqueIdGenerator.EnsureIdsGreaterThan(maxId);

        for (const connection of serializationObject.connections ?? []) {
            const fromBlock = blocksById.get(connection.fromBlock);
            const toBlock = blocksById.get(connection.toBlock);
            if (!fromBlock || !toBlock) {
                continue;
            }
            const fromPoint = fromBlock.outputs.find((point) => point.name === connection.fromPoint);
            const toPoint = toBlock.inputs.find((point) => point.name === connection.toPoint);
            if (fromPoint && toPoint) {
                fromPoint.connectTo(toPoint);
            }
        }

        return asset;
    }

    /**
     * Runs the graph by pulling from the terminal {@link ExportGLTFBlock} and returns the
     * exported glb bytes. Pull-based, no caching; a required input left unconnected is an error.
     * @returns The exported glb bytes.
     */
    public async buildAsync(): Promise<Uint8Array> {
        const exportBlock = this._attachedBlocks.find((block): block is ExportGLTFBlock => block instanceof ExportGLTFBlock);
        if (!exportBlock) {
            throw new Error(`The "${this.name}" node asset has no ExportGLTFBlock to build.`);
        }

        await this._evaluateBlockAsync(exportBlock);

        if (!exportBlock.result) {
            throw new Error(`The "${this.name}" node asset produced no result.`);
        }
        return exportBlock.result;
    }

    /**
     * Recursively evaluates a block: builds every connected input's upstream block first, then
     * propagates the resolved values and builds this block.
     * @param block - The block to evaluate.
     */
    private async _evaluateBlockAsync(block: NodeAssetBlock): Promise<void> {
        const connections = block.inputs.map((input) => {
            const upstream = input.connectedPoint;
            if (!upstream) {
                throw new Error(`The "${input.name}" input of the "${block.name}" block is not connected.`);
            }
            return { input, upstream };
        });

        // Build all upstream blocks first, then propagate their resolved values.
        await Promise.all(
            connections.map(async (connection) => {
                await this._evaluateBlockAsync(connection.upstream.ownerBlock);
            })
        );
        for (const connection of connections) {
            connection.input.value = connection.upstream.value;
        }

        await block._buildBlockAsync();
    }
}
