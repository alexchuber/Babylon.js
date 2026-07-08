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

/**
 * The MIME-like format key used to carry a palette item id through an HTML5 drag-and-drop operation
 * from the palette to the canvas.
 */
export const PaletteDragFormat = "application/x-babylon-node-graph-palette-item";
