import * as React from "react";
import { type Nullable } from "core/types";
import { type Observer } from "core/Misc/observable";

import { GraphNode } from "shared-ui-components/nodeGraphSystem/graphNode";
import { GraphFrame } from "shared-ui-components/nodeGraphSystem/graphFrame";
import { NodePort } from "shared-ui-components/nodeGraphSystem/nodePort";
import { PropertyLedger } from "shared-ui-components/nodeGraphSystem/propertyLedger";
import { Accordion, AccordionSection } from "shared-ui-components/fluent/primitives/accordion";
import { TextPropertyLine } from "shared-ui-components/fluent/hoc/propertyLines/textPropertyLine";
import { TextInputPropertyLine } from "shared-ui-components/fluent/hoc/propertyLines/inputPropertyLine";

import { type GlobalState } from "../../globalState";

interface IPropertyTabComponentProps {
    globalState: GlobalState;
}

interface IPropertyTabComponentState {
    currentNode: Nullable<GraphNode>;
    currentFrame: Nullable<GraphFrame>;
    currentNodePort: Nullable<NodePort>;
}

/**
 * Property tab component for the NAE. Shows properties for the currently selected node/frame.
 */
export class PropertyTabComponent extends React.Component<IPropertyTabComponentProps, IPropertyTabComponentState> {
    private _onSelectionChangedObserver: Nullable<Observer<Nullable<any>>>;

    constructor(props: IPropertyTabComponentProps) {
        super(props);
        this.state = {
            currentNode: null,
            currentFrame: null,
            currentNodePort: null,
        };
    }

    override componentDidMount() {
        this._onSelectionChangedObserver = this.props.globalState.stateManager.onSelectionChangedObservable.add((selection) => {
            if (selection && selection.selection instanceof GraphNode) {
                this.setState({ currentNode: selection.selection, currentFrame: null, currentNodePort: null });
            } else if (selection && selection.selection instanceof GraphFrame) {
                this.setState({ currentNode: null, currentFrame: selection.selection, currentNodePort: null });
            } else if (selection && selection.selection instanceof NodePort) {
                this.setState({ currentNode: null, currentFrame: null, currentNodePort: selection.selection });
            } else {
                this.setState({ currentNode: null, currentFrame: null, currentNodePort: null });
            }
        });
    }

    override componentWillUnmount() {
        this.props.globalState.stateManager.onSelectionChangedObservable.remove(this._onSelectionChangedObserver);
    }

    override render() {
        const { currentNode, currentFrame } = this.state;

        if (currentNode) {
            // Look up property component from the property ledger
            const className = currentNode.content.getClassName();
            // eslint-disable-next-line @typescript-eslint/naming-convention
            const Control = PropertyLedger.RegisteredControls[className] ?? PropertyLedger.DefaultControl;
            if (Control) {
                return <Control stateManager={this.props.globalState.stateManager} nodeData={currentNode.content} />;
            }
        }

        if (currentFrame) {
            return (
                <Accordion>
                    <AccordionSection title="Frame">
                        <TextInputPropertyLine
                            label="Name"
                            value={currentFrame.name}
                            onChange={(value) => {
                                currentFrame.name = value;
                                currentFrame.element.querySelector(".frame-box-header-title")?.setAttribute("title", value);
                                this.forceUpdate();
                            }}
                        />
                        <TextPropertyLine label="Nodes" value={`${currentFrame.nodes.length} node(s)`} />
                    </AccordionSection>
                </Accordion>
            );
        }

        return (
            <Accordion>
                <AccordionSection title="Properties">
                    <TextPropertyLine label="" value="Select a node to see its properties" />
                </AccordionSection>
            </Accordion>
        );
    }
}
