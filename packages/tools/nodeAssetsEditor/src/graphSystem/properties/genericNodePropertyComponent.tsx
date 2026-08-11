import * as React from "react";
import { type IPropertyComponentProps } from "shared-ui-components/nodeGraphSystem/interfaces/propertyComponentProps";
import { TextPropertyLine } from "shared-ui-components/fluent/hoc/propertyLines/textPropertyLine";
import { TextInputPropertyLine } from "shared-ui-components/fluent/hoc/propertyLines/inputPropertyLine";
import { Accordion, AccordionSection } from "shared-ui-components/fluent/primitives/accordion";
import { type NodeAssetBlock } from "node-assets/blockFoundation/nodeAssetBlock";

/**
 * Generic property component for NodeAsset blocks. Shows basic info (class name, name).
 * Block-specific property components can be registered to the property ledger to override this.
 */
export class GenericNodePropertyComponent extends React.Component<IPropertyComponentProps> {
    override render() {
        const block = this.props.nodeData.data as NodeAssetBlock;
        return (
            <Accordion>
                <AccordionSection title="General">
                    <TextPropertyLine label="Type" value={block.getClassName()} />
                    <TextInputPropertyLine
                        label="Name"
                        value={block.name}
                        onChange={(value) => {
                            block.name = value;
                            this.props.stateManager.onUpdateRequiredObservable.notifyObservers(this.props.nodeData);
                            this.forceUpdate();
                        }}
                    />
                </AccordionSection>
            </Accordion>
        );
    }
}
