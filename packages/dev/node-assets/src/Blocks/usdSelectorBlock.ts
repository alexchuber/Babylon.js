import { type IResolvedPrim, type ResolvedPrimKind } from "loaders/USD/resolution/resolvedStage";

import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type NodeAssetJsonArray } from "../connection/nodeAssetValueMap";
import { type NodeAsset } from "../nodeAsset";
import { GetUsdAssetFromInput } from "./usd2GLTFBlock";

/**
 * Selects prims from a {@link UsdAsset} (USD_STAGE) using a query string and
 * exposes the result as a JSON array of prim metadata objects.
 *
 * Supported query syntax:
 * - Exact path: /World/GroupA/Mesh0
 * - Single-level glob: /World/GroupA/* (direct children)
 * - Recursive glob: /World/** (all descendants)
 * - Kind filter: /World/**\/kind:mesh (filter by prim kind after a glob)
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export class USDSelectorBlock extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "USDSelectorBlock";

    /** The USD stage to query. */
    public readonly input: NodeAssetConnectionPoint;

    /** The query string identifying the element to select. */
    public readonly query: NodeAssetConnectionPoint;

    /** The selected element as a JSON object. */
    public readonly output: NodeAssetConnectionPoint;

    /**
     * Creates a new USD selector block.
     * @param name - The display name of the block.
     * @param nodeAsset - The node asset that owns this block.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.input = this._registerInput("input", NodeAssetConnectionPointType.USD_STAGE);
        this.query = this._registerInput("query", NodeAssetConnectionPointType.STRING);
        this.output = this._registerOutput("output", NodeAssetConnectionPointType.JSON);
    }

    /**
     * Selects prims from the resolved stage matching the query pattern and writes them as a
     * JSON array of prim metadata objects on the output.
     */
    public override async _buildBlockAsync(): Promise<void> {
        const usdAsset = GetUsdAssetFromInput(this.input.value, this.name);
        const query = this.query.value as string;
        const matches = SelectPrims(usdAsset.stage.root, query);

        const results: NodeAssetJsonArray = matches.map((prim) => ({
            path: prim.path,
            name: prim.name,
            kind: prim.kind,
            visible: prim.visible,
        }));

        this.output.value = results;
    }
}

RegisterBlock(USDSelectorBlock.ClassName, (name, nodeAsset) => new USDSelectorBlock(name, nodeAsset));

/**
 * Parses a query string and selects matching prims from the resolved prim tree.
 * @param root - The root prim.
 * @param query - The query string.
 * @returns The matching prims.
 */
function SelectPrims(root: IResolvedPrim, query: string): IResolvedPrim[] {
    const { pathPattern, kindFilter } = ParseQuery(query);

    if (pathPattern.endsWith("/**")) {
        const prefix = pathPattern.slice(0, -3);
        const parent = FindPrimExact(root, prefix);
        if (!parent) {
            return [];
        }
        const results: IResolvedPrim[] = [];
        CollectDescendants(parent, results);
        return kindFilter ? results.filter((p) => p.kind === kindFilter) : results;
    }

    if (pathPattern.endsWith("/*")) {
        const prefix = pathPattern.slice(0, -2);
        const parent = FindPrimExact(root, prefix);
        if (!parent) {
            return [];
        }
        const results = parent.children;
        return kindFilter ? results.filter((p) => p.kind === kindFilter) : results;
    }

    // Exact path match
    const prim = FindPrimExact(root, pathPattern);
    if (!prim) {
        return [];
    }
    if (kindFilter && prim.kind !== kindFilter) {
        return [];
    }
    return [prim];
}

interface IParsedQuery {
    pathPattern: string;
    kindFilter: ResolvedPrimKind | undefined;
}

function ParseQuery(query: string): IParsedQuery {
    const kindMatch = query.match(/\/kind:(\w+)$/);
    if (kindMatch) {
        return {
            pathPattern: query.slice(0, -kindMatch[0].length),
            kindFilter: kindMatch[1] as ResolvedPrimKind,
        };
    }
    return { pathPattern: query, kindFilter: undefined };
}

function FindPrimExact(root: IResolvedPrim, path: string): IResolvedPrim | undefined {
    if (root.path === path) {
        return root;
    }
    for (const child of root.children) {
        const found = FindPrimExact(child, path);
        if (found) {
            return found;
        }
    }
    return undefined;
}

function CollectDescendants(prim: IResolvedPrim, results: IResolvedPrim[]): void {
    for (const child of prim.children) {
        results.push(child);
        CollectDescendants(child, results);
    }
}
