/**
 * Builds the palette's categorized block list from the block catalog. Kept as a pure function over a
 * descriptor list — separate from the graph controller — so the grouping and ordering rules can be
 * unit-tested directly and reused. The framework's palette pane consumes the result.
 */

import { type IPaletteCategory, type IPaletteItem } from "../nodeGraph/paletteModel";
import { type IBlockDescriptor } from "./blockCatalog";

/**
 * Groups block descriptors into palette categories, preserving registration order both across and
 * within categories.
 * @param descriptors - The registered block descriptors, in registration (display) order.
 * @returns The palette categories.
 */
export function BuildPaletteCategories(descriptors: readonly IBlockDescriptor[]): readonly IPaletteCategory[] {
    const itemsByCategory = new Map<string, IPaletteItem[]>();
    for (const descriptor of descriptors) {
        const label = descriptor.category;
        let items = itemsByCategory.get(label);
        if (!items) {
            items = [];
            itemsByCategory.set(label, items);
        }
        items.push({
            id: descriptor.paletteItemId,
            label: descriptor.label,
            ...(descriptor.description === undefined ? {} : { description: descriptor.description }),
            ...(descriptor.keywords === undefined ? {} : { keywords: descriptor.keywords }),
        });
    }
    return Array.from(itemsByCategory, ([label, items]) => ({ label, items }));
}
