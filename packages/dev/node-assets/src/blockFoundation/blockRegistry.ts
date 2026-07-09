import { type NodeAsset } from "../nodeAsset";
import { type NodeAssetBlock } from "./nodeAssetBlock";

/**
 * Constructs a block instance for the given display name and owning node asset. Each block module
 * registers a factory (see the {@link RegisterBlock} call beside its class) so {@link NodeAsset.Parse}
 * can rebuild blocks from their serialized class name without a central switch.
 */
export type NodeAssetBlockFactory = (name: string, nodeAsset: NodeAsset) => NodeAssetBlock;

// Class-name -> factory registry, populated by each block module's import-time RegisterBlock call.
// Insertion order is preserved so enumeration reflects registration order.
const BlockFactories = new Map<string, NodeAssetBlockFactory>();

/**
 * Registers a block class's factory under its class name so it can be reconstructed on load. Called
 * once per block at module load; a later registration for the same class name replaces the earlier one.
 * @param className - The block's serialized class name (its static `ClassName`).
 * @param factory - Creates a new instance of the block for the given name and node asset.
 */
export function RegisterBlock(className: string, factory: NodeAssetBlockFactory): void {
    BlockFactories.set(className, factory);
}

/**
 * Constructs a block from its serialized class name using the registered factory.
 * @param className - The block's serialized class name.
 * @param name - The display name to give the block.
 * @param nodeAsset - The node asset that will own the block.
 * @returns The constructed block.
 * @throws If no block is registered under the given class name.
 */
export function CreateBlockByClassName(className: string, name: string, nodeAsset: NodeAsset): NodeAssetBlock {
    const factory = BlockFactories.get(className);
    if (!factory) {
        throw new Error(`Cannot deserialize unknown block type "${className}".`);
    }
    return factory(name, nodeAsset);
}

/**
 * Lists the class names of all registered blocks, in registration order. Intended for tests and
 * tooling that enumerate the available block types.
 * @returns The registered block class names.
 */
export function GetRegisteredBlockClassNames(): string[] {
    return Array.from(BlockFactories.keys());
}
