/**
 * Model types for the palette pane: a categorized, filterable list of items that can be dragged onto
 * the canvas to create new nodes. Editor-agnostic — the host supplies the categories and decides what
 * a dropped item becomes.
 */

/**
 * A single draggable entry in the palette.
 */
export interface IPaletteItem {
    /** Stable unique identifier for the palette entry (e.g. a node-kind key). */
    readonly id: string;
    /** Human readable label shown in the list. */
    readonly label: string;
    /** Optional family heading shown within the containing category. */
    readonly family?: string;
    /** Optional concise explanation exposed as palette help and used by search. */
    readonly description?: string;
    /** Workflow terms and aliases used by palette search. */
    readonly keywords?: readonly string[];
}

/**
 * A named group of palette items, rendered as one collapsible accordion section.
 */
export interface IPaletteCategory {
    /** Section title. */
    readonly label: string;
    /** The items in this category. */
    readonly items: readonly IPaletteItem[];
}

/** Options that project the host catalog into the palette's visible discovery surface. */
export interface IPaletteProjectionOptions {
    /** User-entered search text. */
    readonly filter?: string;
    /** Whether abstracted primitive palette entries are discoverable alongside their aggregates. Aggregates always show. */
    readonly showPrimitives?: boolean;
}

/**
 * Tests whether a palette item matches a user-entered search term.
 * @param item - Palette item to search.
 * @param categoryLabel - Category containing the item.
 * @param filter - User-entered filter text.
 * @returns Whether any discoverability field contains the normalized filter.
 */
export function PaletteItemMatchesFilter(item: IPaletteItem, categoryLabel: string, filter: string): boolean {
    const normalizedFilter = filter.trim().toLowerCase();
    if (!normalizedFilter) {
        return true;
    }
    return [item.label, item.family ?? "", categoryLabel, item.description ?? "", ...(item.keywords ?? [])].some((value) => value.toLowerCase().includes(normalizedFilter));
}

/**
 * The MIME-like format key used to carry a palette item id through an HTML5 drag-and-drop operation
 * from the palette to the canvas.
 */
export const PaletteDragFormat = "application/x-babylon-node-graph-palette-item";
