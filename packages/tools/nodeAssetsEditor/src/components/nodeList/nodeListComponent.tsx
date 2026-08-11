import { type FunctionComponent, useState, useMemo } from "react";
import { makeStyles, tokens, Input } from "@fluentui/react-components";
import { SearchRegular } from "@fluentui/react-icons";

import { Accordion, AccordionSection, AccordionSectionItem } from "shared-ui-components/fluent/primitives/accordion";

import { type GlobalState } from "../../globalState";
import { GetAllBlockDescriptors, type IBlockDescriptor } from "../../nodeAssets/blockCatalog";
import { DraggableLine } from "./draggableLine";

interface INodeListComponentProps {
    globalState: GlobalState;
}

const useStyles = makeStyles({
    root: {
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
    },
    search: {
        padding: tokens.spacingHorizontalS,
    },
    list: {
        flex: 1,
        overflow: "auto",
    },
});

/**
 * Node palette for the NAE. Groups blocks by category and supports search.
 * @returns The rendered node list component.
 */
export const NodeListComponent: FunctionComponent<INodeListComponentProps> = ({ globalState }) => {
    const classes = useStyles();
    const [filter, setFilter] = useState("");

    const allDescriptors = useMemo(() => GetAllBlockDescriptors(), []);

    // Group by category
    const categories = useMemo(() => {
        const map = new Map<string, IBlockDescriptor[]>();
        for (const desc of allDescriptors) {
            if (desc.isPaletteVisible === false) {
                continue;
            }
            const category = desc.category ?? "Other";
            let list = map.get(category);
            if (!list) {
                list = [];
                map.set(category, list);
            }
            list.push(desc);
        }
        return map;
    }, [allDescriptors]);

    // Filter
    const lowerFilter = filter.toLowerCase();
    const filteredCategories = useMemo(() => {
        if (!lowerFilter) {
            return categories;
        }
        const result = new Map<string, IBlockDescriptor[]>();
        for (const [category, descriptors] of categories) {
            const filtered = descriptors.filter(
                (d) =>
                    d.label.toLowerCase().includes(lowerFilter) ||
                    d.description?.toLowerCase().includes(lowerFilter) ||
                    d.keywords?.some((k) => k.toLowerCase().includes(lowerFilter))
            );
            if (filtered.length > 0) {
                result.set(category, filtered);
            }
        }
        return result;
    }, [categories, lowerFilter]);

    return (
        <div className={classes.root}>
            <div className={classes.search}>
                <Input placeholder="Search nodes..." contentBefore={<SearchRegular />} value={filter} onChange={(_, data) => setFilter(data.value)} size="small" />
            </div>
            <div className={classes.list}>
                <Accordion>
                    {Array.from(filteredCategories.entries()).map(([category, descriptors]) => (
                        <AccordionSection key={category} title={category}>
                            {descriptors.map((desc) => (
                                <AccordionSectionItem key={desc.paletteItemId} uniqueId={desc.paletteItemId}>
                                    <DraggableLine data={desc.paletteItemId} label={desc.label} tooltip={desc.description ?? desc.label} color={desc.headerColor} />
                                </AccordionSectionItem>
                            ))}
                        </AccordionSection>
                    ))}
                </Accordion>
            </div>
        </div>
    );
};
