import { useCallback, type FunctionComponent, type ReactElement } from "react";

import { makeStyles, tokens, Caption1 } from "@fluentui/react-components";

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
    root: {
        display: "flex",
        flexDirection: "column",
        padding: tokens.spacingVerticalM,
        gap: tokens.spacingVerticalS,
        height: "100%",
        boxSizing: "border-box",
        overflow: "hidden",
    },
    preview: {
        alignItems: "center",
        backgroundColor: tokens.colorNeutralBackground3,
        border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
        borderRadius: tokens.borderRadiusMedium,
        boxSizing: "border-box",
        display: "flex",
        height: "160px",
        justifyContent: "center",
        flexShrink: 0,
    },
    content: {
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        flexGrow: 1,
    },
    emptySelection: {
        paddingTop: tokens.spacingVerticalS,
    },
});

const HexColorValidator = (value: string): boolean => /^#[0-9a-fA-F]{6}$/.test(value);

function RenderPropertyLine(descriptor: PropertyDescriptor, key: string): ReactElement {
    switch (descriptor.kind) {
        case "text":
            return <TextInputPropertyLine key={key} uniqueId={key} label={descriptor.label} value={descriptor.value} onChange={descriptor.onChange} />;
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
 * Renders the selected node preview placeholder and editable property sections.
 * @param props - Component props.
 * @returns The rendered properties pane.
 */
export const PropertiesView: FunctionComponent<{ context: EditorContextValue }> = (props) => {
    const { context } = props;
    const classes = useStyles();
    const getSelectedNode = useCallback(() => ({ node: context.state.primarySelectedNode }), [context]);
    const selectedNode = useObservableState(getSelectedNode, context.state.onSelectionChanged, context.state.onChanged).node;
    const sections: readonly IPropertySection[] = selectedNode ? context.buildPropertySections(selectedNode) : [];

    return (
        <div className={classes.root}>
            <div className={classes.preview}>
                <Caption1>Preview</Caption1>
            </div>
            <div className={classes.content}>
                {selectedNode ? (
                    <Accordion uniqueId="node-assets-properties">
                        {sections.map((section) => (
                            <AccordionSection key={section.title} title={section.title} collapseByDefault={section.collapseByDefault}>
                                {section.properties.map((property, index) => RenderPropertyLine(property, `${section.title}-${index}`))}
                            </AccordionSection>
                        ))}
                    </Accordion>
                ) : (
                    <Caption1 className={classes.emptySelection}>No selection</Caption1>
                )}
            </div>
        </div>
    );
};
