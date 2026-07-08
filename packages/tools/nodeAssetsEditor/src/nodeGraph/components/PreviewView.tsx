import { type FunctionComponent } from "react";

import { Caption1, makeStyles, tokens } from "@fluentui/react-components";

const useStyles = makeStyles({
    root: {
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
        padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalM}`,
    },
    surface: {
        alignItems: "center",
        backgroundColor: tokens.colorNeutralBackground3,
        border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
        borderRadius: tokens.borderRadiusMedium,
        boxSizing: "border-box",
        color: tokens.colorNeutralForeground3,
        display: "flex",
        flexGrow: 1,
        justifyContent: "center",
        minHeight: "160px",
    },
});

/**
 * Renders the asset preview surface placeholder. Registered as its own bottom-left dock pane.
 * @returns The rendered preview pane.
 */
export const PreviewView: FunctionComponent = () => {
    const classes = useStyles();

    return (
        <div className={classes.root}>
            <div className={classes.surface}>
                <Caption1>Preview</Caption1>
            </div>
        </div>
    );
};
