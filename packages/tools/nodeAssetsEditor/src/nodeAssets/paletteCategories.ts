/**
 * Builds the palette's categorized block list from the block catalog. Kept as a pure function over a
 * descriptor list — separate from the graph controller — so the grouping and ordering rules can be
 * unit-tested directly and reused. The framework's palette pane consumes the result.
 */

import { type IPaletteCategory, type IPaletteItem, type IPaletteProjectionOptions, PaletteItemMatchesFilter } from "../nodeGraph/paletteModel";
import { type IBlockDescriptor } from "./blockCatalog";

/** Palette category label for blocks whose descriptor does not specify one. */
const DefaultPaletteCategory = "Blocks";

/**
 * Groups block descriptors into palette categories, preserving registration order both across and
 * within categories. Descriptors without a category fall into the default one.
 * @param descriptors - The registered block descriptors, in registration (display) order.
 * @param options - Discovery preferences applied before categories are returned.
 * @returns The non-empty palette categories.
 */
export function BuildPaletteCategories(descriptors: readonly IBlockDescriptor[], options: IPaletteProjectionOptions = {}): readonly IPaletteCategory[] {
    const itemsByCategory = new Map<string, IPaletteItem[]>();
    for (const descriptor of descriptors) {
        if (descriptor.isPaletteVisible === false || (!options.showPrimitives && descriptor.abstractedBy !== undefined)) {
            continue;
        }
        const label = descriptor.category ?? DefaultPaletteCategory;
        const item: IPaletteItem = {
            id: descriptor.paletteItemId,
            label: descriptor.label,
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
    return Array.from(itemsByCategory, ([label, items]) => ({ label, items }));
}
