/**
 * Builds the palette's categorized block list from the block catalog. Kept as a pure function over a
 * descriptor list — separate from the graph controller — so the grouping and ordering rules can be
 * unit-tested directly and reused. The framework's palette pane consumes the result.
 */

import { type IPaletteCategory, type IPaletteItem, type IPaletteProjectionOptions, PaletteItemMatchesFilter } from "../nodeGraph/paletteModel";
import { type IBlockDescriptor, PaletteCategoryOrder } from "./blockCatalog";

/** Palette category label for blocks whose descriptor does not specify one. */
const DefaultPaletteCategory = "Blocks";

/**
 * Groups block descriptors into palette categories. Items keep registration order within a category;
 * categories are ordered by {@link PaletteCategoryOrder}, with any others following in registration
 * order. Descriptors without a category fall into the default one.
 * @param descriptors - The registered block descriptors, in registration (display) order.
 * @param options - Discovery preferences applied before categories are returned.
 * @returns The non-empty palette categories.
 */
export function BuildPaletteCategories(descriptors: readonly IBlockDescriptor[], options: IPaletteProjectionOptions = {}): readonly IPaletteCategory[] {
    const itemsByCategory = new Map<string, IPaletteItem[]>();
    // Aggregates and standalone blocks lead the palette; abstracted primitives append after when shown.
    const orderedDescriptors = options.showPrimitives
        ? [...descriptors.filter((descriptor) => descriptor.abstractedBy === undefined), ...descriptors.filter((descriptor) => descriptor.abstractedBy !== undefined)]
        : descriptors;
    for (const descriptor of orderedDescriptors) {
        if (descriptor.isPaletteVisible === false || (!options.showPrimitives && descriptor.abstractedBy !== undefined)) {
            continue;
        }
        const label = descriptor.category ?? DefaultPaletteCategory;
        const item: IPaletteItem = {
            id: descriptor.paletteItemId,
            label: descriptor.label,
            ...(descriptor.family === undefined ? {} : { family: descriptor.family }),
            ...(descriptor.description === undefined ? {} : { description: descriptor.description }),
            ...(descriptor.keywords === undefined ? {} : { keywords: descriptor.keywords }),
        };
        if (!PaletteItemMatchesFilter(item, label, options.filter ?? "")) {
            continue;
        }
        let items = itemsByCategory.get(label);
        if (!items) {
            items = [];
            itemsByCategory.set(label, items);
        }
        items.push(item);
    }
    const categories = Array.from(itemsByCategory, ([label, items]) => ({ label, items }));
    // Order categories by the canonical pipeline-stage order; categories outside that list keep registration order after it.
    const rankOf = (label: string) => {
        const rank = PaletteCategoryOrder.indexOf(label);
        return rank === -1 ? PaletteCategoryOrder.length : rank;
    };
    return categories.sort((left, right) => rankOf(left.label) - rankOf(right.label));
}
