/**
 * Descriptor model for the properties pane. The host describes the property UI for the current
 * selection as plain data; the framework renders it with Fluent property-line HOCs. This keeps the
 * framework free of any knowledge about what a node's properties actually mean.
 */

/**
 * A single editable text property.
 */
export interface ITextPropertyDescriptor {
    /** Discriminant identifying this as a text property line. */
    readonly kind: "text";
    /** Label shown to the left of the input. */
    readonly label: string;
    /** Current text value. */
    readonly value: string;
    /** Optional validator; invalid values are displayed but not committed. */
    readonly validator?: (value: string) => boolean;
    /** When true, commits valid edits only when the text box blurs or Enter is pressed. */
    readonly validateOnlyOnBlur?: boolean;
    /** Called with the new value when the user edits the text. */
    readonly onChange: (value: string) => void;
    /** When true, the value is visible but cannot be edited. */
    readonly disabled?: boolean;
}

/**
 * A single-select dropdown property.
 */
export interface IDropdownPropertyDescriptor {
    /** Discriminant identifying this as a dropdown property line. */
    readonly kind: "dropdown";
    /** Label shown to the left of the dropdown. */
    readonly label: string;
    /** Currently selected value. */
    readonly value: string;
    /** The selectable options. */
    readonly options: readonly string[];
    /** Called with the new value when the user picks an option. */
    readonly onChange: (value: string) => void;
}

/**
 * A numeric slider property.
 */
export interface ISliderPropertyDescriptor {
    /** Discriminant identifying this as a slider property line. */
    readonly kind: "slider";
    /** Label shown to the left of the slider. */
    readonly label: string;
    /** Current numeric value. */
    readonly value: number;
    /** Minimum allowed value. */
    readonly min: number;
    /** Maximum allowed value. */
    readonly max: number;
    /** Step increment. */
    readonly step: number;
    /** Called with the new value as the slider moves. */
    readonly onChange: (value: number) => void;
}

/** An editable three-component numeric vector. */
export interface IVector3PropertyDescriptor {
    /** Discriminant identifying this as a vector property line. */
    readonly kind: "vector3";
    /** Label shown beside the expandable vector value. */
    readonly label: string;
    /** Current XYZ value. */
    readonly value: readonly [number, number, number];
    /** Optional shared minimum for each component. */
    readonly min?: number;
    /** Optional shared maximum for each component. */
    readonly max?: number;
    /** Component input step. */
    readonly step?: number;
    /** Optional displayed unit. */
    readonly unit?: string;
    /** Called with the new XYZ value. */
    readonly onChange: (value: [number, number, number]) => void;
}

/**
 * A boolean switch property.
 */
export interface ISwitchPropertyDescriptor {
    /** Discriminant identifying this as a switch property line. */
    readonly kind: "switch";
    /** Label shown to the left of the switch. */
    readonly label: string;
    /** Current boolean value. */
    readonly value: boolean;
    /** Called with the new value when the switch is toggled. */
    readonly onChange: (value: boolean) => void;
}

/**
 * A color property, edited as a hex string.
 */
export interface IColorPropertyDescriptor {
    /** Discriminant identifying this as a color property line. */
    readonly kind: "color";
    /** Label shown to the left of the color input. */
    readonly label: string;
    /** Current color as a hex string. */
    readonly value: string;
    /** Called with the new color when the user edits it. */
    readonly onChange: (value: string) => void;
}

/**
 * An action button property (e.g. "Reset to default").
 */
export interface IButtonPropertyDescriptor {
    /** Discriminant identifying this as a button property line. */
    readonly kind: "button";
    /** Button label. */
    readonly label: string;
    /** Called when the button is pressed. */
    readonly onClick: () => void;
}

/**
 * The union of all supported property-line descriptors.
 */
export type PropertyDescriptor =
    | ITextPropertyDescriptor
    | IDropdownPropertyDescriptor
    | ISliderPropertyDescriptor
    | IVector3PropertyDescriptor
    | ISwitchPropertyDescriptor
    | IColorPropertyDescriptor
    | IButtonPropertyDescriptor;

/**
 * A titled accordion section grouping a set of property lines.
 */
export interface IPropertySection {
    /** Section title (e.g. "GENERAL"). */
    readonly title: string;
    /** Whether the section starts collapsed. */
    readonly collapseByDefault?: boolean;
    /** The property lines in this section. */
    readonly properties: readonly PropertyDescriptor[];
}
