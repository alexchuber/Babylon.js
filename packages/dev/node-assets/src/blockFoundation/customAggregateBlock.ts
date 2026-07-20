import { RegisterBlock } from "./blockRegistry";
import { AggregateBlock } from "./aggregateBlock";
import { type NodeAsset } from "../nodeAsset";

/** An aggregate whose owned subgraph belongs to the authored graph. */
export class CustomAggregateBlock extends AggregateBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "CustomAggregateBlock";

    /**
     * Creates an empty custom aggregate. Its owned graph is populated by detachment or deserialization.
     * @param name The display name.
     * @param nodeAsset The owning graph.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
    }

    /**
     * Detaches a built-in aggregate into an editable custom aggregate.
     * @param aggregate The aggregate definition to copy.
     * @param name The custom aggregate's display name.
     * @param nodeAsset The graph that will own the custom aggregate.
     * @returns The detached custom aggregate.
     */
    public static FromAggregate(aggregate: AggregateBlock, name: string, nodeAsset: NodeAsset): CustomAggregateBlock {
        const custom = new CustomAggregateBlock(name, nodeAsset);
        custom._deserialize({
            ...aggregate.serialize(),
            customType: CustomAggregateBlock.ClassName,
            id: custom.uniqueId,
            name,
        });
        return custom;
    }
}

RegisterBlock(CustomAggregateBlock.ClassName, (name, nodeAsset) => new CustomAggregateBlock(name, nodeAsset));
