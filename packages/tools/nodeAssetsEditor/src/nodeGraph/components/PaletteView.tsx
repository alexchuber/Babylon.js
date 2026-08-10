import { cloneElement, Fragment, type DragEvent, type FunctionComponent, type PointerEventHandler, type ReactElement, useEffect, useMemo, useRef, useState } from "react";

import { Accordion, AccordionHeader, AccordionItem, AccordionPanel, Body1, Caption1, Checkbox, makeStyles, tokens } from "@fluentui/react-components";
import { SearchBar } from "shared-ui-components/fluent/primitives/searchBar";
import { Tooltip } from "shared-ui-components/fluent/primitives/tooltip";

import { type EditorContextValue } from "../editorContext";
import { type IPaletteCategory, type IPaletteItem, type IPalettePreferences, PaletteDragFormat } from "../paletteModel";

const useStyles = makeStyles({
    root: {
        display: "flex",
        flexDirection: "column",
        gap: tokens.spacingVerticalM,
        height: "100%",
        minHeight: 0,
        overflow: "hidden",
        padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalM}`,
    },
    header: {
        display: "flex",
        flexDirection: "column",
        gap: tokens.spacingVerticalS,
        flexShrink: 0,
    },
    accordion: {
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        overflowY: "auto",
    },
    panel: {
        display: "flex",
        flexDirection: "column",
        gap: tokens.spacingVerticalXS,
        paddingBottom: tokens.spacingVerticalS,
    },
    row: {
        alignItems: "flex-start",
        backgroundColor: tokens.colorNeutralBackground1,
        border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke1}`,
        borderRadius: tokens.borderRadiusMedium,
        boxSizing: "border-box",
        color: tokens.colorNeutralForeground1,
        cursor: "grab",
        display: "flex",
        flexDirection: "column",
        minHeight: tokens.spacingVerticalXXL,
        padding: `${tokens.spacingVerticalSNudge} ${tokens.spacingHorizontalM}`,
        userSelect: "none",

        ":hover": {
            backgroundColor: tokens.colorNeutralBackground1Hover,
        },

        ":active": {
            backgroundColor: tokens.colorNeutralBackground1Pressed,
            cursor: "grabbing",
        },
    },
    empty: {
        color: tokens.colorNeutralForeground3,
    },
});

const GetCategoryValue = (category: IPaletteCategory, index: number) => `${index}:${category.label}`;
const TouchFocusSuppressionWindowMs = 1_000;

type PaletteItemTooltipProps = {
    children: ReactElement<{ onPointerDownCapture?: PointerEventHandler<HTMLDivElement> }>;
    content?: string;
};

const PaletteItemTooltip: FunctionComponent<PaletteItemTooltipProps> = (props) => {
    const { children, content } = props;
    const [visible, setVisible] = useState(false);
    const lastTouchPointerDownAt = useRef<number | null>(null);
    const target = cloneElement(children, {
        onPointerDownCapture: (event) => {
            lastTouchPointerDownAt.current = event.pointerType === "touch" ? event.timeStamp : null;
            children.props.onPointerDownCapture?.(event);
        },
    });

    return (
        <Tooltip
            content={content}
            visible={visible}
            onVisibleChange={(event, data) => {
                const isTouchPointer = event !== undefined && "pointerType" in event && event.pointerType === "touch";
                const touchPointerDownAt = lastTouchPointerDownAt.current;
                const isFocusEvent = event?.type.startsWith("focus") === true;
                const isTouchFocus =
                    isFocusEvent && touchPointerDownAt !== null && event.timeStamp >= touchPointerDownAt && event.timeStamp - touchPointerDownAt <= TouchFocusSuppressionWindowMs;
                if (isFocusEvent) {
                    lastTouchPointerDownAt.current = null;
                }
                setVisible(data.visible && !isTouchPointer && !isTouchFocus);
            }}
        >
            {target}
        </Tooltip>
    );
};

/**
 * Renders the categorized node palette and prepares dragged palette items for canvas drops.
 * @param props - Component props.
 * @returns The rendered palette pane.
 */
export const PaletteView: FunctionComponent<{ context: EditorContextValue; preferences: IPalettePreferences }> = (props) => {
    const { context, preferences } = props;
    const classes = useStyles();
    const [filter, setFilter] = useState("");
    const [showPrimitives, setShowPrimitives] = useState(() => preferences.showPrimitives);
    const categories = useMemo(() => context.getPaletteCategories({ filter, showPrimitives }), [context, filter, showPrimitives]);
    const categoryValues = useMemo(() => categories.map(GetCategoryValue), [categories]);
    const [openCategoryValues, setOpenCategoryValues] = useState<string[]>(categoryValues);
    const isFiltering = filter.trim().length > 0;

    useEffect(() => {
        setOpenCategoryValues((previousOpenValues) => {
            const availableValues = new Set(categoryValues);
            const nextOpenValues = previousOpenValues.filter((value) => availableValues.has(value));

            for (const value of categoryValues) {
                if (!previousOpenValues.includes(value)) {
                    nextOpenValues.push(value);
                }
            }

            return nextOpenValues;
        });
    }, [categoryValues]);

    const effectiveOpenCategoryValues = isFiltering ? categoryValues : openCategoryValues;

    const onDragStart = (event: DragEvent<HTMLDivElement>, item: IPaletteItem) => {
        event.dataTransfer.effectAllowed = "copy";
        event.dataTransfer.setData(PaletteDragFormat, item.id);
        event.dataTransfer.setData("text/plain", item.label);
    };

    return (
        <div className={classes.root} data-testid="node-palette">
            <div className={classes.header}>
                <Checkbox
                    checked={showPrimitives}
                    label="Show primitives"
                    onChange={(_, data) => {
                        const nextValue = data.checked === true;
                        preferences.showPrimitives = nextValue;
                        setShowPrimitives(nextValue);
                    }}
                />
                <SearchBar onChange={setFilter} placeholder="Search palette" />
            </div>
            {categories.length > 0 ? (
                <Accordion
                    className={classes.accordion}
                    collapsible
                    multiple
                    openItems={effectiveOpenCategoryValues}
                    onToggle={(_, data) => {
                        if (!isFiltering) {
                            setOpenCategoryValues(data.openItems.map((value) => String(value)));
                        }
                    }}
                >
                    {categories.map((category, index) => {
                        const value = GetCategoryValue(category, index);
                        return (
                            <AccordionItem key={value} value={value}>
                                <AccordionHeader>
                                    <Body1 data-testid="palette-category">
                                        {category.label} ({category.items.length})
                                    </Body1>
                                </AccordionHeader>
                                <AccordionPanel>
                                    <div className={classes.panel}>
                                        {category.items.map((item, itemIndex) => {
                                            const tooltipContent = item.description?.trim() || undefined;
                                            const labelId = `palette-item-label-${item.id}`;
                                            return (
                                                <Fragment key={item.id}>
                                                    <PaletteItemTooltip content={tooltipContent}>
                                                        <div
                                                            aria-labelledby={labelId}
                                                            className={classes.row}
                                                            data-testid="palette-item"
                                                            draggable={true}
                                                            tabIndex={0}
                                                            onDragStart={(event) => onDragStart(event, item)}
                                                        >
                                                            <Body1 id={labelId} data-testid="palette-item-label">
                                                                {item.label}
                                                            </Body1>
                                                        </div>
                                                    </PaletteItemTooltip>
                                                </Fragment>
                                            );
                                        })}
                                    </div>
                                </AccordionPanel>
                            </AccordionItem>
                        );
                    })}
                </Accordion>
            ) : (
                <Caption1 className={classes.empty}>No palette items match the current search.</Caption1>
            )}
        </div>
    );
};
