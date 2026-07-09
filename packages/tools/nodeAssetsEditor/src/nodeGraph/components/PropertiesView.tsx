import { useCallback, type FunctionComponent, type ReactElement } from "react";

import { makeStyles, tokens, Body1Strong } from "@fluentui/react-components";

import { type EditorContextValue } from "../editorContext";
import { type IPropertySection, type PropertyDescriptor } from "../propertyModel";
import { useObservableState } from "shared-ui-components/modularTool/hooks/observableHooks";
import { Accordion, AccordionSection } from "shared-ui-components/fluent/primitives/accordion";
import { TextInputPropertyLine } from "shared-ui-components/fluent/hoc/propertyLines/inputPropertyLine";
import { StringDropdownPropertyLine } from "shared-ui-components/fluent/hoc/propertyLines/dropdownPropertyLine";
import { SyncedSliderPropertyLine } from "shared-ui-components/fluent/hoc/propertyLines/syncedSliderPropertyLine";
import { SwitchPropertyLine } from "shared-ui-components/fluent/hoc/propertyLines/switchPropertyLine";
import { ButtonLine } from "shared-ui-components/fluent/hoc/buttonLine";

const useStyles = makeStyles({
    placeholder: {
        padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalM}`,
    },
});

const HexColorValidator = (value: string): boolean => /^#[0-9a-fA-F]{6}$/.test(value);

function RenderPropertyLine(descriptor: PropertyDescriptor, key: string): ReactElement {
    switch (descriptor.kind) {
        case "text":
            return (
                <TextInputPropertyLine
                    key={key}
                    uniqueId={key}
                    label={descriptor.label}
                    value={descriptor.value}
                    validator={descriptor.validator}
                    validateOnlyOnBlur={descriptor.validateOnlyOnBlur}
                    onChange={descriptor.onChange}
                />
            );
        case "dropdown":
            return (
                <StringDropdownPropertyLine
                    key={key}
                    uniqueId={key}
                    label={descriptor.label}
                    value={descriptor.value}
                    options={descriptor.options.map((option) => ({ label: option, value: option }))}
                    onChange={descriptor.onChange}
                />
            );
        case "slider":
            return (
                <SyncedSliderPropertyLine
                    key={key}
                    uniqueId={key}
                    label={descriptor.label}
                    value={descriptor.value}
                    min={descriptor.min}
                    max={descriptor.max}
                    step={descriptor.step}
                    onChange={descriptor.onChange}
                />
            );
        case "switch":
            return <SwitchPropertyLine key={key} uniqueId={key} label={descriptor.label} value={descriptor.value} onChange={descriptor.onChange} />;
        case "color":
            return (
                <TextInputPropertyLine
                    key={key}
                    uniqueId={key}
                    label={descriptor.label}
                    value={descriptor.value}
                    validator={HexColorValidator}
                    validateOnlyOnBlur={true}
                    onChange={descriptor.onChange}
                />
            );
        case "button":
            return <ButtonLine key={key} uniqueId={key} label={descriptor.label} onClick={descriptor.onClick} />;
    }
}

/**
 * Renders the editable property sections for the selected node, matching the Inspector properties pane layout.
 * @param props - Component props.
 * @returns The rendered properties pane.
 */
export const PropertiesView: FunctionComponent<{ context: EditorContextValue }> = (props) => {
    const { context } = props;
    const classes = useStyles();
    const getSelectedNode = useCallback(() => ({ node: context.state.primarySelectedNode }), [context]);
    const selectedNode = useObservableState(getSelectedNode, context.state.onSelectionChanged, context.state.onChanged).node;
    const sections: readonly IPropertySection[] = selectedNode ? context.buildPropertySections(selectedNode) : [];

    return selectedNode ? (
        <Accordion uniqueId="node-assets-properties">
            {sections.map((section) => (
                <AccordionSection key={section.title} title={section.title} collapseByDefault={section.collapseByDefault}>
                    {section.properties.map((property, index) => RenderPropertyLine(property, `${section.title}-${index}`))}
                </AccordionSection>
            ))}
        </Accordion>
    ) : (
        <div className={classes.placeholder}>
            <Body1Strong italic>No selection</Body1Strong>
        </div>
    );
};
