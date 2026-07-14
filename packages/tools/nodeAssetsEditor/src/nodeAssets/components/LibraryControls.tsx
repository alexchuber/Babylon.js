import { type FunctionComponent, useCallback, useState } from "react";

import { Body1, Subtitle2, makeStyles, tokens } from "@fluentui/react-components";

import { Logger } from "core/Misc/logger";

import { Button } from "shared-ui-components/fluent/primitives/button";
import { Collapse } from "shared-ui-components/fluent/primitives/collapse";
import { Dialog } from "shared-ui-components/fluent/primitives/dialog";

import { GraphCanvas } from "../../nodeGraph/components/GraphCanvas";
import { type EditorContextValue } from "../../nodeGraph/editorContext";
import { type INodeAssetLibraryEntry, type NodeAssetLibrary } from "../nodeAssetLibrary";

interface ILibraryControlsProps {
    readonly context: EditorContextValue;
    readonly library: NodeAssetLibrary;
    readonly onSave: () => INodeAssetLibraryEntry;
    readonly onLoad: (entry: INodeAssetLibraryEntry) => void;
}

const useStyles = makeStyles({
    root: {
        position: "absolute",
        inset: "0",
    },
    controls: {
        position: "absolute",
        top: tokens.spacingVerticalS,
        right: tokens.spacingHorizontalM,
        zIndex: 2,
        display: "flex",
        flexDirection: "row",
        gap: tokens.spacingHorizontalS,
    },
    dialogContent: {
        display: "flex",
        flexDirection: "column",
        gap: tokens.spacingVerticalL,
        minWidth: "320px",
        maxHeight: "60vh",
        overflowY: "auto",
    },
    section: {
        display: "flex",
        flexDirection: "column",
        gap: tokens.spacingVerticalS,
    },
    entryButton: {
        width: "100%",
        justifyContent: "flex-start",
    },
    error: {
        color: tokens.colorPaletteRedForeground1,
    },
    empty: {
        color: tokens.colorNeutralForeground3,
    },
});

function GetErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/**
 * NodeAssets-specific canvas chrome for saving and opening graphs from the browser Library.
 * @param props - The editor context, library, and graph actions.
 * @returns The graph canvas with Library controls and dialog.
 */
export const LibraryControls: FunctionComponent<ILibraryControlsProps> = (props) => {
    const { context, library, onSave, onLoad } = props;
    const classes = useStyles();
    const [isOpen, setIsOpen] = useState(false);
    const [entries, setEntries] = useState<readonly INodeAssetLibraryEntry[]>(() => library.getBuiltInEntries());
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const reportError = useCallback((error: unknown) => {
        const message = GetErrorMessage(error);
        Logger.Error(`[NodeAssetsEditor] Library operation failed: ${message}`);
        setErrorMessage(message);
    }, []);

    const refreshEntries = useCallback(() => {
        const builtInEntries = library.getBuiltInEntries();
        try {
            setEntries([...builtInEntries, ...library.getUserEntries()]);
            setErrorMessage(null);
        } catch (error) {
            setEntries(builtInEntries);
            reportError(error);
        }
    }, [library, reportError]);

    const saveToLibrary = useCallback(() => {
        try {
            onSave();
            refreshEntries();
            window.alert("Saved to library");
        } catch (error) {
            reportError(error);
            setIsOpen(true);
        }
    }, [onSave, refreshEntries, reportError]);

    const openLibrary = useCallback(() => {
        refreshEntries();
        setIsOpen(true);
    }, [refreshEntries]);

    const loadEntry = useCallback(
        (entry: INodeAssetLibraryEntry) => {
            try {
                onLoad(entry);
                setErrorMessage(null);
                setIsOpen(false);
            } catch (error) {
                reportError(error);
            }
        },
        [onLoad, reportError]
    );

    const builtInEntries = entries.filter((entry) => entry.source === "built-in");
    const userEntries = entries.filter((entry) => entry.source === "user");

    return (
        <div className={classes.root}>
            <GraphCanvas context={context} />
            <div className={classes.controls} data-testid="library-controls">
                <Button appearance="secondary" label="Save to Library" onClick={saveToLibrary} />
                <Button appearance="secondary" label="Open Library" onClick={openLibrary} />
            </div>
            <Dialog open={isOpen} title="NodeAsset Library" onDismiss={() => setIsOpen(false)}>
                <div className={classes.dialogContent}>
                    <Collapse visible={errorMessage !== null}>
                        <Body1 className={classes.error}>{errorMessage}</Body1>
                    </Collapse>
                    <div className={classes.section}>
                        <Subtitle2>Samples</Subtitle2>
                        {builtInEntries.map((entry) => (
                            <Button key={entry.id} className={classes.entryButton} appearance="subtle" label={entry.name} onClick={() => loadEntry(entry)} />
                        ))}
                    </div>
                    <div className={classes.section}>
                        <Subtitle2>Saved</Subtitle2>
                        {userEntries.length === 0 ? (
                            <Body1 className={classes.empty}>No saved graphs yet.</Body1>
                        ) : (
                            userEntries.map((entry) => (
                                <Button key={entry.id} className={classes.entryButton} appearance="subtle" label={entry.name} onClick={() => loadEntry(entry)} />
                            ))
                        )}
                    </div>
                </div>
            </Dialog>
        </div>
    );
};
