import { type FunctionComponent, useCallback, useRef } from "react";

import { Body1, makeStyles, Spinner, tokens } from "@fluentui/react-components";

import { ButtonLine } from "shared-ui-components/fluent/hoc/buttonLine";
import { ChildWindow, type ChildWindow as ChildWindowHandle } from "shared-ui-components/fluent/hoc/childWindow";
import { StringifiedPropertyLine } from "shared-ui-components/fluent/hoc/propertyLines/stringifiedPropertyLine";
import { MessageBar } from "shared-ui-components/fluent/primitives/messageBar";
import { useObservableState } from "shared-ui-components/modularTool/hooks/observableHooks";

import { type GLTFValidationController } from "../gltfValidationController";

const useStyles = makeStyles({
    root: {
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        gap: tokens.spacingVerticalS,
        height: "100%",
        overflowY: "auto",
        padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalM}`,
    },
    validating: {
        alignItems: "center",
        display: "flex",
        flexGrow: 1,
        justifyContent: "center",
    },
    reportDetails: {
        boxSizing: "border-box",
        height: "100%",
        overflow: "auto",
        padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalM}`,
    },
    reportJson: {
        fontFamily: tokens.fontFamilyMonospace,
        whiteSpace: "pre-wrap",
    },
});

const ValidationReport: FunctionComponent<{ controller: GLTFValidationController }> = (props) => {
    const { controller } = props;
    const classes = useStyles();
    const childWindow = useRef<ChildWindowHandle>(null);
    const state = controller.state;
    if (state.status !== "report") {
        return null;
    }

    const issues = state.results.issues;
    const hasErrors = issues.numErrors > 0;

    return (
        <>
            <MessageBar intent={hasErrors ? "error" : "success"} message={hasErrors ? "Your output has validation issues" : "Your output is a valid glTF file"} />
            <StringifiedPropertyLine key="NumErrors" label="Errors" value={issues.numErrors} />
            <StringifiedPropertyLine key="NumWarnings" label="Warnings" value={issues.numWarnings} />
            <StringifiedPropertyLine key="NumInfos" label="Infos" value={issues.numInfos} />
            <StringifiedPropertyLine key="NumHints" label="Hints" value={issues.numHints} />
            <ButtonLine label="View Report Details" onClick={() => childWindow.current?.open({ title: "glTF Validation Results" })} />
            <ChildWindow id="nodeAssetsGLTFValidationResults" imperativeRef={childWindow}>
                <div className={classes.reportDetails}>
                    <Body1 className={classes.reportJson}>{JSON.stringify(state.results, null, 2)}</Body1>
                </div>
            </ChildWindow>
        </>
    );
};

/**
 * Shows glTF validation status and the latest report for successful Node Assets Editor builds.
 * @param props - Component props.
 * @returns The validation pane.
 */
export const GLTFValidationPane: FunctionComponent<{ controller: GLTFValidationController }> = (props) => {
    const { controller } = props;
    const classes = useStyles();
    const getState = useCallback(() => controller.state, [controller]);
    const state = useObservableState(getState, controller.onStateChanged);

    let content;
    switch (state.status) {
        case "validating":
            content = (
                <div className={classes.validating} role="status" aria-live="polite">
                    <Spinner label="Validating glTF output" />
                </div>
            );
            break;
        case "report":
            content = <ValidationReport controller={controller} />;
            break;
        case "not-applicable":
            content = <MessageBar intent="info" message="glTF validation does not apply to image outputs." />;
            break;
        case "unavailable":
            content = <MessageBar intent="warning" title="Validation unavailable" message={state.message} />;
            break;
        default:
            content = <MessageBar intent="info" message="Build a scene output to see glTF validation results." />;
            break;
    }

    return <div className={classes.root}>{content}</div>;
};
