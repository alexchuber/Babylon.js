import { type DragEvent, type FunctionComponent, useEffect, useMemo, useState } from "react";

import { Accordion, AccordionHeader, AccordionItem, AccordionPanel, Body1, Caption1, makeStyles, tokens } from "@fluentui/react-components";
import { SearchBar } from "shared-ui-components/fluent/primitives/searchBar";

import { type EditorContextValue } from "../editorContext";
import { type IPaletteCategory, type IPaletteItem, PaletteDragFormat } from "../paletteModel";

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
    search: {
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
        alignItems: "center",
        backgroundColor: tokens.colorNeutralBackground1,
        border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke1}`,
        borderRadius: tokens.borderRadiusMedium,
        boxSizing: "border-box",
        color: tokens.colorNeutralForeground1,
        cursor: "grab",
        display: "flex",
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

type FilteredPaletteCategory = {
    readonly category: IPaletteCategory;
    readonly items: readonly IPaletteItem[];
    readonly value: string;
};

const GetCategoryValue = (category: IPaletteCategory, index: number) => `${index}:${category.label}`;

/**
 * Renders the categorized node palette and prepares dragged palette items for canvas drops.
 * @param props - Component props.
 * @returns The rendered palette pane.
 */
export const PaletteView: FunctionComponent<{ context: EditorContextValue }> = (props) => {
    const { context } = props;
    const classes = useStyles();
    const [filter, setFilter] = useState("");
    const categoryValues = useMemo(() => context.paletteCategories.map(GetCategoryValue), [context.paletteCategories]);
    const [openCategoryValues, setOpenCategoryValues] = useState<string[]>(categoryValues);
    const normalizedFilter = filter.trim().toLowerCase();
    const isFiltering = normalizedFilter.length > 0;

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

    const filteredCategories = useMemo<readonly FilteredPaletteCategory[]>(() => {
        return context.paletteCategories
            .map((category, index) => {
                const items = isFiltering ? category.items.filter((item) => item.label.toLowerCase().includes(normalizedFilter)) : category.items;
                return {
                    category,
                    items,
                    value: GetCategoryValue(category, index),
                };
            })
            .filter((category) => !isFiltering || category.items.length > 0);
    }, [context.paletteCategories, isFiltering, normalizedFilter]);

    const effectiveOpenCategoryValues = isFiltering ? filteredCategories.map((category) => category.value) : openCategoryValues;

    const onDragStart = (event: DragEvent<HTMLDivElement>, item: IPaletteItem) => {
        event.dataTransfer.effectAllowed = "copy";
        event.dataTransfer.setData(PaletteDragFormat, item.id);
        event.dataTransfer.setData("text/plain", item.label);
    };

    return (
        <div className={classes.root}>
            <div className={classes.search}>
                <SearchBar onChange={setFilter} placeholder="Search palette" />
            </div>
            {filteredCategories.length > 0 ? (
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
                    {filteredCategories.map(({ category, items, value }) => (
                        <AccordionItem key={value} value={value}>
                            <AccordionHeader>
                                <Body1>
                                    {category.label} ({items.length})
                                </Body1>
                            </AccordionHeader>
                            <AccordionPanel>
                                <div className={classes.panel}>
                                    {items.map((item) => (
                                        <div key={item.id} className={classes.row} draggable={true} title={item.label} onDragStart={(event) => onDragStart(event, item)}>
                                            <Body1>{item.label}</Body1>
                                        </div>
                                    ))}
                                </div>
                            </AccordionPanel>
                        </AccordionItem>
                    ))}
                </Accordion>
            ) : (
                <Caption1 className={classes.empty}>No palette items match the current search.</Caption1>
            )}
        </div>
    );
};
