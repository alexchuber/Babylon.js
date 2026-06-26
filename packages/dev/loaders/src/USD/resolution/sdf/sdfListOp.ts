/**
 * USD list-editing operation for ordered lists such as references, payloads, inherits,
 * specializes, relationship targets, and attribute connections.
 */
export interface ISdfListOp<Item> {
    /** True when the authoring was an explicit list opinion that replaces weaker list opinions. */
    isExplicit: boolean;
    /** Explicit items, replacing weaker list opinions when present. */
    explicit?: Item[];
    /** Items prepended ahead of weaker items. */
    prepended?: Item[];
    /** Items appended after weaker items. */
    appended?: Item[];
    /** Legacy "add" items. Composition applies these with USD list-op semantics. */
    added?: Item[];
    /** Items removed from weaker opinions. */
    deleted?: Item[];
    /** Reordering constraints applied after list composition. */
    ordered?: Item[];
}
