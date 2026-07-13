/**
 * Shared metadata contract for Node Assets Editor demos.
 *
 * The graph is represented as a serialized NodeAsset payload or declarative
 * node descriptors so resource evaluation steps remain inspectable alongside
 * domain and transcoding expectations.
 */

import { type NodeAsset } from "node-assets/nodeAsset";

import { type IGraphFrame, type Vec2 } from "../nodeGraph/graphModel";

/** Current version of the demo catalog metadata contract. */
export const DemoCatalogSchemaVersion = 2 as const;

/** The planned catalog contains eight teachable demos. */
export const DemoCatalogDemoCount = 8 as const;

/** Teaching concepts that the catalog can make explicit for a demo. */
export const DemoTeachingConcept = {
    DOMAIN_SELECTIONS: "domain-selections",
    SELECTION_DIAGNOSTICS: "selection-diagnostics",
    PHYSICAL_METADATA: "physical-metadata",
    EXPECTED_LOSSES: "expected-losses",
    NODE_GEOMETRY_EVALUATION: "node-geometry-evaluation",
    IMAGE_BINDINGS: "image-bindings",
    PRE_EXPORT_REVIEW: "pre-export-review",
    GRAPH_LAYOUT: "graph-layout",
} as const;

/** A concept a demo is intended to teach. */
export type DemoTeachingConcept = (typeof DemoTeachingConcept)[keyof typeof DemoTeachingConcept];

/** One-based position of a demo in the eight-demo catalog. */
export type DemoCatalogDemoOrder = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/** Scene representations that can be connected by a transcoder. */
export const DemoSceneRepresentation = {
    GLTF: "gltf",
    USD: "usd",
    BABYLON: "babylon",
} as const;

/** A scene representation supported by a demo resource. */
export type DemoSceneRepresentation = (typeof DemoSceneRepresentation)[keyof typeof DemoSceneRepresentation];

/** Kinds of resources that can participate in a demo. */
export const DemoResourceKind = {
    GLTF: DemoSceneRepresentation.GLTF,
    USD: DemoSceneRepresentation.USD,
    BABYLON: DemoSceneRepresentation.BABYLON,
    NODE_GEOMETRY: "nodeGeometry",
} as const;

/** A resource kind supported by the demo catalog. */
export type DemoResourceKind = (typeof DemoResourceKind)[keyof typeof DemoResourceKind];

/** Policies a transcoder may apply to a feature that does not map directly. */
export const DemoLossPolicy = {
    PRESERVE: "preserve",
    BAKE: "bake",
    DROP: "drop",
    EXTENSION: "extension",
} as const;

/** A structured policy for an expected conversion loss. */
export type DemoLossPolicy = (typeof DemoLossPolicy)[keyof typeof DemoLossPolicy];

/** Severity shown for an expected conversion diagnostic. */
export const DemoLossSeverity = {
    INFO: "info",
    WARNING: "warning",
    ERROR: "error",
} as const;

/** Severity of an expected conversion diagnostic. */
export type DemoLossSeverity = (typeof DemoLossSeverity)[keyof typeof DemoLossSeverity];

/** Coordinate handedness values used by scene resources. */
export const DemoHandedness = {
    LEFT: "left",
    RIGHT: "right",
    PRESERVED: "preserved",
    CONVERTED: "converted",
} as const;

/** Coordinate handedness used by a scene resource or demo. */
export type DemoHandedness = (typeof DemoHandedness)[keyof typeof DemoHandedness];

/** Axis identifiers used by the up-axis domain tag. */
export const DemoUpAxis = {
    X: "X",
    Y: "Y",
    Z: "Z",
    PRESERVED: "preserved",
    CONVERTED: "converted",
} as const;

/** Up axis used by a scene resource or demo. */
export type DemoUpAxis = (typeof DemoUpAxis)[keyof typeof DemoUpAxis];

/** Domain conventions that a demo or one of its resources expects. */
export type DemoDomainTags = {
    /** Coordinate handedness. */
    readonly handedness?: DemoHandedness;
    /** Unit name, such as `meters`, `centimeters`, or a source-specific unit. */
    readonly unit?: string;
    /** Positive axis treated as up by the source or target domain. */
    readonly upAxis?: DemoUpAxis;
    /** Optional scale applied when converting the authored unit. */
    readonly unitScale?: number;
};

/** Conventions declared for a demo's source and target asset domains. */
export type DemoAssetConventions = {
    /** Whether handedness is preserved or converted at the boundary. */
    readonly handedness: DemoHandedness;
    /** Authored or target unit, such as `meter` or `centimeter`. */
    readonly unit: string;
    /** Authored or target up axis. */
    readonly upAxis: DemoUpAxis;
    /** Optional scale applied when converting the authored unit. */
    readonly unitScale?: number;
};

/** USD container/text formats accepted by bundled catalog fixtures. */
export const DemoUsdFixtureFormat = {
    USDA: "usda",
    USDC: "usdc",
    USDZ: "usdz",
} as const;

/** A USDA, USDC, or USDZ fixture format. */
export type DemoUsdFixtureFormat = (typeof DemoUsdFixtureFormat)[keyof typeof DemoUsdFixtureFormat];

/**
 * An exact, domain-owned selection value.
 *
 * The value is deliberately not an editor node id or a generic path. The
 * `valueKind` identifies the source domain's addressing scheme.
 */
export type DemoDomainSelection =
    | {
          readonly domain: typeof DemoSceneRepresentation.GLTF;
          readonly granularity: "scene" | "node" | "mesh" | "primitive" | "material" | "texture" | "animation" | "skin" | "camera" | "light" | "variant";
          readonly valueKind: "jsonPointer";
          readonly value: string;
      }
    | {
          readonly domain: typeof DemoSceneRepresentation.USD;
          readonly granularity: "stage" | "prim" | "property" | "material" | "texture" | "animation" | "camera" | "light" | "variant";
          readonly valueKind: "primPath" | "propertyPath";
          readonly value: string;
      }
    | {
          readonly domain: typeof DemoSceneRepresentation.BABYLON;
          readonly granularity: "scene" | "node" | "mesh" | "material" | "texture" | "animation" | "camera" | "light";
          readonly valueKind: "uniqueId" | "name";
          readonly value: string;
      };

/** A selection that resolved to a source-domain value. */
export type DemoResolvedSelection = {
    readonly status: "resolved";
    readonly selection: DemoDomainSelection;
};

/** A selection that no longer matches the current source but retains its value. */
export type DemoStaleSelection = {
    readonly status: "stale";
    readonly selection: DemoDomainSelection;
    readonly diagnostic: {
        readonly status: "stale";
        readonly why: string;
    };
};

/** A selection whose source-domain value cannot be found. */
export type DemoDanglingSelection = {
    readonly status: "dangling";
    readonly selection: DemoDomainSelection;
    readonly diagnostic: {
        readonly status: "dangling";
        readonly why: string;
    };
};

/** A selection slot that was intentionally left without a value. */
export type DemoEmptySelection = {
    readonly status: "empty";
    readonly diagnostic: {
        readonly status: "empty";
        readonly why: string;
    };
};

/** The resolution state of one exact-granularity selection. */
export type DemoSelectionResolution = DemoResolvedSelection | DemoStaleSelection | DemoDanglingSelection | DemoEmptySelection;

/** A named selection used by a demo and its diagnostic state. */
export type DemoSelectionExpectation = {
    readonly id: string;
    readonly label?: string;
    readonly resolution: DemoSelectionResolution;
};

/** A URL-backed resource source. */
export type DemoUrlSource = {
    readonly kind: "url";
    readonly url: string;
};

/** A snippet-server-backed resource source. */
export type DemoSnippetSource = {
    readonly kind: "snippet";
    readonly snippetId: string;
};

/** A same-origin fixture bundled with the editor application. */
export type DemoBundledSource = {
    readonly kind: "bundled";
    /** Stable key used by the editor's bundled-asset registry. */
    readonly assetKey: string;
    /** Same-origin path served by the editor application. */
    readonly path: string;
    /** MIME type used when fetching or handing the fixture to a parser. */
    readonly mimeType: string;
    /** Human-readable fixture provenance. */
    readonly sourceLabel: string;
    readonly origin: "same-origin";
};

/** An inline serialized resource source. */
export type DemoInlineSource = {
    readonly kind: "inline";
    readonly value: string;
};

/** An inline JSON resource source, used by serialized graph resources. */
export type DemoInlineJsonSource = {
    readonly kind: "inlineJson";
    /** JSON text or a plain serialized JSON object, never a live engine object. */
    readonly json: string | Readonly<Record<string, unknown>>;
};

/** A file-backed resource source. */
export type DemoFileSource = {
    readonly kind: "file";
    readonly path: string;
    readonly name?: string;
};

/** Ways a demo resource can be loaded. */
export type DemoResourceSource = DemoUrlSource | DemoSnippetSource | DemoBundledSource | DemoInlineSource | DemoInlineJsonSource | DemoFileSource;

/** Common metadata for a demo resource. */
export type DemoResourceBase = {
    /** Stable identifier used by the demo graph or UI. */
    readonly id: string;
    /** Human-readable resource name. */
    readonly label: string;
    /** Location or serialized value used to load the resource. */
    readonly source: DemoResourceSource;
    /** Source format identifier when it is more specific than the resource kind. */
    readonly format?: string;
    /** Display label for the authored source. */
    readonly sourceLabel?: string;
    /** Optional snippet identifier retained as catalog metadata. */
    readonly snippetId?: string;
    /** Conventions for this resource, when they differ from the demo defaults. */
    readonly domainTags?: DemoDomainTags;
    /** Loss diagnostics scoped to the conversion that produces this resource. */
    readonly expectedLosses?: readonly DemoLossDiagnostic[];
};

/** A glTF or Babylon scene resource. */
export type DemoNonUsdSceneResource = DemoResourceBase & {
    readonly kind: typeof DemoSceneRepresentation.GLTF | typeof DemoSceneRepresentation.BABYLON;
};

/**
 * A USD fixture plus the platform representation and Babylon adaptation
 * boundary. `IResolvedStage` is metadata here, never a live stage object.
 */
export type DemoResolvedUsdStage = {
    readonly representation: "IResolvedStage";
    readonly sourceFormat: DemoUsdFixtureFormat;
};

/** Losses produced while adapting an `IResolvedStage` to Babylon. */
export type DemoUsdAdaptation = {
    readonly target: typeof DemoSceneRepresentation.BABYLON;
    readonly losses: readonly DemoLossDiagnostic[];
};

/** A USD fixture plus its resolved-stage and Babylon adaptation metadata. */
export type DemoUsdResource = DemoResourceBase & {
    readonly kind: typeof DemoSceneRepresentation.USD;
    readonly format: DemoUsdFixtureFormat;
    readonly resolvedStage: DemoResolvedUsdStage;
    readonly adaptation: DemoUsdAdaptation;
};

/** Any scene resource supported by the catalog. */
export type DemoSceneResource = DemoNonUsdSceneResource | DemoUsdResource;

/** A scene representation supported by a typed scene resource. */
export type DemoSceneResourceKind = DemoSceneResource["kind"];

/**
 * A serialized NodeGeometry graph resource.
 *
 * Evaluation is deliberately not stored on the resource. The graph's
 * `EvaluateNodeGeometry`/`BakeNodeGeometry` nodes own the explicit build and
 * attach boundaries.
 */
export type DemoNodeGeometryResource = DemoResourceBase & {
    readonly kind: typeof DemoResourceKind.NODE_GEOMETRY;
    readonly format: "babylon-node-geometry";
};

/** Any resource that may be listed by a demo. */
export type DemoResource = DemoSceneResource | DemoNodeGeometryResource;

/** A serialized NodeAsset graph payload. */
export type DemoNodeAssetGraph = ReturnType<NodeAsset["serialize"]>;

/** An import node that exposes a NodeGeometry resource as geometry data. */
export type DemoImportNodeGeometryNode = {
    readonly kind: "ImportNodeGeometry";
    readonly id?: string;
    readonly resourceId: string;
    /** Output remains procedural until an explicit evaluation node consumes it. */
    readonly output: "proceduralGeometry";
};

/**
 * An explicit NodeGeometry evaluation node.
 *
 * This node represents `NodeGeometry.build()` and exposes the resulting
 * vertex data without attaching a mesh to a Babylon scene.
 */
export type DemoEvaluateNodeGeometryNode = {
    readonly kind: "EvaluateNodeGeometry";
    readonly id?: string;
    readonly geometry: string;
    readonly output: "vertexData";
    readonly evaluation: {
        readonly mode: "explicit";
        readonly operation: "build";
    };
};

/**
 * An explicit NodeGeometry bake/realization node.
 *
 * This node represents the visible `NodeGeometry.createMesh()` boundary.
 */
export type DemoBakeNodeGeometryNode = {
    readonly kind: "BakeNodeGeometry";
    readonly id?: string;
    readonly geometry: string;
    readonly scene: string;
    readonly meshName: string;
    /** Realized scene output used by a subsequent composition or export node. */
    readonly output?: string;
    readonly evaluation: {
        readonly mode: "explicit";
        readonly operation: "createMesh";
    };
};

/** Imports a scene resource into a declarative adapter graph. */
export type DemoImportSceneNode = {
    readonly kind: "ImportScene";
    readonly id?: string;
    readonly resourceId: string;
    readonly output: string;
};

/** Adapts a resolved source scene to the target domain. */
export type DemoAdaptSceneNode = {
    readonly kind: "AdaptScene";
    readonly id?: string;
    readonly input: string;
    readonly output: string;
    readonly target: typeof DemoSceneRepresentation.BABYLON | typeof DemoSceneRepresentation.GLTF;
};

/** Merges multiple scene outputs without hiding the composition boundary. */
export type DemoMergeScenesNode = {
    readonly kind: "MergeScenes";
    readonly id?: string;
    readonly inputs: readonly string[];
    readonly output: string;
};

/** Applies a named mutation against a domain-owned selection. */
export type DemoMutateSceneNode = {
    readonly kind: "MutateScene";
    readonly id?: string;
    readonly input: string;
    readonly output: string;
    readonly selectionId: string;
    readonly operation: "set-property";
};

/** Exports a declarative scene graph to a terminal format. */
export type DemoExportSceneNode = {
    readonly kind: "ExportScene";
    readonly id?: string;
    readonly input: string;
    readonly format: "gltf";
};

/** Declarative node descriptor accepted by a demo graph. */
export type DemoGraphNode =
    | DemoImportNodeGeometryNode
    | DemoEvaluateNodeGeometryNode
    | DemoBakeNodeGeometryNode
    | DemoImportSceneNode
    | DemoAdaptSceneNode
    | DemoMergeScenesNode
    | DemoMutateSceneNode
    | DemoExportSceneNode;

/** Graph payloads supported by the catalog. */
export type DemoGraphPayload = DemoNodeAssetGraph | readonly DemoGraphNode[];

/** Visual metadata for one block in the editor canvas. */
export type DemoEditorBlockMetadata = {
    /** Runtime block id used to match the visual node to the serialized graph. */
    readonly id: number;
    /** Graph-space position. */
    readonly position: Vec2;
    /** Human-readable node title. */
    readonly title: string;
    /** Whether the node body is collapsed. */
    readonly collapsed: boolean;
    /** Optional export file name owned by the editor. */
    readonly fileName?: string;
};

/** A visible expected-loss badge anchored to one or more graph nodes. */
export type DemoLossBadge = {
    /** Stable id of the matching entry in `expectedLosses`. */
    readonly diagnosticId: string;
    /** Short label shown in the demo card or graph. */
    readonly label: string;
    /** Badge tone derived from the expected-loss severity. */
    readonly severity: DemoLossSeverity;
    /** Graph nodes where the badge is visible. */
    readonly graphNodeIds: readonly (number | string)[];
};

/** Editor-owned metadata that must round-trip with a demo graph. */
export type DemoEditorMetadata = {
    /** Visual block metadata. */
    readonly blocks: readonly DemoEditorBlockMetadata[];
    /** Frames that group and position related nodes. */
    readonly frames: readonly IGraphFrame[];
    /** Expected-loss badges positioned with the graph layout. */
    readonly lossBadges: readonly DemoLossBadge[];
};

/** Semantic roles available to bundled asset bindings. */
export const DemoAssetRole = {
    SOURCE_SCENE: "source-scene",
    BASE_COLOR: "base-color",
    NORMAL: "normal",
    ROUGHNESS: "roughness",
    METALLIC: "metallic",
    EMISSIVE: "emissive",
    MASK: "mask",
    WATERMARK: "watermark",
    REFERENCE: "reference",
} as const;

/** A semantic role assigned to a bundled asset binding. */
export type DemoAssetRole = (typeof DemoAssetRole)[keyof typeof DemoAssetRole];

/** A bundled asset binding used to hydrate a graph input. */
export type DemoAssetBinding = {
    /** Runtime block id whose input receives the asset. */
    readonly blockId: number;
    /** Domain/block-owned input slot receiving the binding. */
    readonly input: string;
    /** Key for the bundled asset in the editor package. */
    readonly bundledAssetKey: string;
    /** Semantic role of the asset; image roles stay bindings, not resource kinds. */
    readonly role: DemoAssetRole;
    /** MIME type supplied to the runtime block, when required. */
    readonly mimeType?: string;
    /** Human-readable source label shown in the editor. */
    readonly sourceLabel?: string;
};

/** Terminal preview/output metadata for a demo. */
export type DemoTerminal = {
    readonly kind: "gltf" | "image";
    readonly expectedMimeType?: string;
};

/** Status of NodeGeometry support for a demo. */
export type DemoNodeGeometryEvaluationStatus = "not-applicable" | "supported" | "requires-adapter" | "deferred";

/** A serialized NodeGeometry definition, never a live NodeGeometry instance. */
export type DemoSerializedNodeGeometry = Readonly<Record<string, unknown>>;

/** Metadata for evaluating or realizing NodeGeometry in a demo. */
export type DemoNodeGeometryEvaluation = {
    /** Current adapter/build support for this demo. */
    readonly status: DemoNodeGeometryEvaluationStatus;
    /** The visible node that ends the procedural phase. */
    readonly proceduralUntil: "EvaluateNodeGeometry" | "BakeNodeGeometry" | "not-applicable";
    /** Serialized NodeGeometry JSON, when the demo supplies one. */
    readonly definition?: DemoSerializedNodeGeometry;
    /** Target scene location for the realized mesh, when applicable. */
    readonly target?: {
        readonly parentPointer?: string;
        readonly name: string;
    };
    /** Why this status is correct for the demo. */
    readonly why: string;
};

/** Expected observable result of running a demo. */
export type DemoOutcome = {
    /** Human-readable result expected in the preview or output. */
    readonly description: string;
    /** Optional assertions used by validation or demo documentation. */
    readonly assertions?: readonly string[];
};

/** The graph and metadata shown immediately before the terminal export. */
export type DemoPreExportReview = {
    /** Explicit visibility contract for the review surface. */
    readonly visibility: "before-terminal-export";
    /** Graph node at which the review is visible before the terminal export. */
    readonly beforeExportNodeId: string | number;
    /** Physical metadata shown in the review surface. */
    readonly physicalMetadata: DemoAssetConventions;
    /** All expected losses accumulated by this point in the pipeline. */
    readonly accumulatedLosses: readonly DemoLossDiagnostic[];
};

/** Teaching and graph-focus metadata for one catalog demo. */
export type DemoTeachingMetadata = {
    /** One-based position in the planned eight-demo catalog. */
    readonly order: DemoCatalogDemoOrder;
    /** Concepts deliberately taught by this demo. */
    readonly concepts: readonly DemoTeachingConcept[];
    /** The short lesson the user should take away. */
    readonly takeaway: string;
    /** Frames and nodes emphasized by the demo's initial graph layout. */
    readonly focus: {
        readonly frameIds: readonly string[];
        readonly blockIds: readonly (number | string)[];
    };
};

/** Base fields shared by all expected loss diagnostics. */
type DemoLossDiagnosticBase = {
    /** Stable identifier referenced by badges and pre-export review. */
    readonly id: string;
    /** Feature whose representation changes at the transcoder boundary. */
    readonly feature: string;
    /** Severity presented to the demo author. */
    readonly severity: DemoLossSeverity;
    /** Why this policy is expected and what the author should know. */
    readonly why: string;
};

/** An expected loss handled without a named extension. */
export type DemoExpectedLossDiagnostic = DemoLossDiagnosticBase & {
    readonly policy: Exclude<DemoLossPolicy, typeof DemoLossPolicy.EXTENSION>;
};

/** An expected loss preserved through a named target extension. */
export type DemoExtensionLossDiagnostic = DemoLossDiagnosticBase & {
    readonly policy: typeof DemoLossPolicy.EXTENSION;
    /** Extension that carries the feature across the boundary. */
    readonly extension: string;
};

/** A structured, expected conversion-loss diagnostic. */
export type DemoLossDiagnostic = DemoExpectedLossDiagnostic | DemoExtensionLossDiagnostic;

/** Metadata for one browseable pipeline demo. */
export type DemoDefinition = {
    /** Stable catalog identifier. */
    readonly id: string;
    /** Human-readable title. */
    readonly title: string;
    /** Short explanation shown in the demo gallery. */
    readonly summary: string;
    /** Backward-compatible longer description, when the gallery needs one. */
    readonly description?: string;
    /** Search and filter labels shown by the demo gallery. */
    readonly tags: readonly string[];
    /** Resources required to construct the demo graph. */
    readonly resources: readonly DemoResource[];
    /** Serialized runtime graph or declarative graph nodes for a non-NodeAsset adapter. */
    readonly graph: DemoGraphPayload;
    /** Editor-owned positions, frames, and node display metadata. */
    readonly editor: DemoEditorMetadata;
    /** Bundled assets bound to runtime import blocks. */
    readonly assets: readonly DemoAssetBinding[];
    /** Exact source-domain selections and their explicit resolution diagnostics. */
    readonly selections: readonly DemoSelectionExpectation[];
    /** Terminal preview/output contract. */
    readonly terminal: DemoTerminal;
    /** Conventions for the demo's active source and target domains. */
    readonly conventions: DemoAssetConventions;
    /** Conversion expectations for the demo as a whole. */
    readonly expectedLosses: readonly DemoLossDiagnostic[];
    /** Explicit NodeGeometry status, even when the demo does not use it. */
    readonly nodeGeometry: DemoNodeGeometryEvaluation;
    /** Observable result expected after the graph runs. */
    readonly expectedOutcome: DemoOutcome;
    /** Physical metadata and accumulated losses visible before terminal export. */
    readonly preExportReview: DemoPreExportReview;
    /** Teaching intent and graph layout focus for the catalog entry. */
    readonly teaching: DemoTeachingMetadata;
    /** Default conventions for the demo's active domain. */
    readonly domainTags?: DemoDomainTags;
};

/** A versioned collection of browseable pipeline demos. */
export type DemoCatalog = {
    /** Schema version used to interpret this catalog. */
    readonly version: typeof DemoCatalogSchemaVersion;
    /** Demo entries in gallery order. */
    readonly demos: readonly DemoDefinition[];
};

/**
 * Narrows a resource to NodeGeometry. The resource is serialized data only;
 * use {@link IsEvaluateNodeGeometryNode} and {@link IsBakeNodeGeometryNode}
 * to inspect its explicit evaluation boundary.
 *
 * @param resource - Resource to inspect.
 * @returns `true` when the resource is NodeGeometry.
 */
export function IsNodeGeometryResource(resource: DemoResource): resource is DemoNodeGeometryResource {
    return resource.kind === DemoResourceKind.NODE_GEOMETRY;
}

/**
 * Narrows a graph node to the explicit NodeGeometry evaluation boundary.
 *
 * @param node - Graph node to inspect.
 * @returns `true` when the node evaluates NodeGeometry into vertex data.
 */
export function IsEvaluateNodeGeometryNode(node: DemoGraphNode): node is DemoEvaluateNodeGeometryNode {
    return node.kind === "EvaluateNodeGeometry";
}

/**
 * Narrows a graph node to the explicit NodeGeometry bake boundary.
 *
 * @param node - Graph node to inspect.
 * @returns `true` when the node bakes NodeGeometry into a Babylon scene mesh.
 */
export function IsBakeNodeGeometryNode(node: DemoGraphNode): node is DemoBakeNodeGeometryNode {
    return node.kind === "BakeNodeGeometry";
}

type DemoSerializedBlock = {
    readonly customType: string;
    readonly id: number;
    readonly name: string;
    readonly [key: string]: unknown;
};

type DemoSerializedConnection = {
    readonly fromBlock: number;
    readonly fromPoint: string;
    readonly toBlock: number;
    readonly toPoint: string;
};

function CreateSerializedNodeAssetGraph(name: string, blocks: readonly DemoSerializedBlock[], connections: readonly DemoSerializedConnection[]): DemoNodeAssetGraph {
    return { name, blocks, connections };
}

function CreateBundledSource(assetKey: string, path: string, mimeType: string, sourceLabel: string): DemoBundledSource {
    return { kind: "bundled", assetKey, path, mimeType, sourceLabel, origin: "same-origin" };
}

function CreateGltfResource(id: string, label: string, assetKey: string, path: string): DemoNonUsdSceneResource {
    return {
        id,
        label,
        kind: DemoResourceKind.GLTF,
        format: "glb",
        source: CreateBundledSource(assetKey, path, "model/gltf-binary", label),
        sourceLabel: label,
        domainTags: { handedness: "right", unit: "meters", upAxis: "Y" },
    };
}

function CreateUsdResource(id: string, label: string, assetKey: string, path: string, format: DemoUsdFixtureFormat, losses: readonly DemoLossDiagnostic[]): DemoUsdResource {
    return {
        id,
        label,
        kind: DemoResourceKind.USD,
        format,
        source: CreateBundledSource(assetKey, path, format === DemoUsdFixtureFormat.USDZ ? "model/vnd.usdz+zip" : "model/vnd.usd", label),
        sourceLabel: label,
        resolvedStage: { representation: "IResolvedStage", sourceFormat: format },
        adaptation: { target: DemoSceneRepresentation.BABYLON, losses },
        expectedLosses: losses,
        domainTags: { handedness: "right", unit: "meters", upAxis: "Z" },
    };
}

function CreateBabylonResource(id: string, label: string, assetKey: string, path: string): DemoNonUsdSceneResource {
    return {
        id,
        label,
        kind: DemoResourceKind.BABYLON,
        format: "babylon",
        source: CreateBundledSource(assetKey, path, "application/json", label),
        sourceLabel: label,
        domainTags: { handedness: "left", unit: "meters", upAxis: "Y" },
    };
}

function CreateNodeGeometryResource(id: string, label: string, source: DemoResourceSource, snippetId?: string): DemoNodeGeometryResource {
    return {
        id,
        label,
        kind: DemoResourceKind.NODE_GEOMETRY,
        format: "babylon-node-geometry",
        source,
        sourceLabel: label,
        ...(snippetId ? { snippetId } : {}),
    };
}

function CreateResolvedSelection(id: string, selection: DemoDomainSelection, label?: string): DemoSelectionExpectation {
    return { id, ...(label ? { label } : {}), resolution: { status: "resolved", selection } };
}

function CreateStaleSelection(id: string, selection: DemoDomainSelection, why: string, label?: string): DemoSelectionExpectation {
    return { id, ...(label ? { label } : {}), resolution: { status: "stale", selection, diagnostic: { status: "stale", why } } };
}

function CreateDanglingSelection(id: string, selection: DemoDomainSelection, why: string, label?: string): DemoSelectionExpectation {
    return { id, ...(label ? { label } : {}), resolution: { status: "dangling", selection, diagnostic: { status: "dangling", why } } };
}

function CreateEmptySelection(id: string, why: string, label?: string): DemoSelectionExpectation {
    return { id, ...(label ? { label } : {}), resolution: { status: "empty", diagnostic: { status: "empty", why } } };
}

function CreateEditorBlock(id: number, title: string, x: number, y: number, fileName?: string): DemoEditorBlockMetadata {
    return { id, title, position: { x, y }, collapsed: false, ...(fileName ? { fileName } : {}) };
}

function CreateEditorFrame(id: string, label: string, color: string, x: number, y: number, width: number, height: number, nodeIds: readonly string[]): IGraphFrame {
    return { id, label, color, position: { x, y }, size: { width, height }, nodeIds, collapsed: false };
}

function CreateLossBadge(diagnostic: DemoLossDiagnostic, label: string, graphNodeIds: readonly (number | string)[]): DemoLossBadge {
    return { diagnosticId: diagnostic.id, label, severity: diagnostic.severity, graphNodeIds };
}

function CreatePreExportReview(beforeExportNodeId: number | string, conventions: DemoAssetConventions, losses: readonly DemoLossDiagnostic[]): DemoPreExportReview {
    return { visibility: "before-terminal-export", beforeExportNodeId, physicalMetadata: conventions, accumulatedLosses: losses };
}

const NoNodeGeometry: DemoNodeGeometryEvaluation = {
    status: "not-applicable",
    proceduralUntil: "not-applicable",
    why: "This pipeline does not contain a NodeGeometry resource.",
};

const StandardGltfConventions: DemoAssetConventions = {
    handedness: "right",
    unit: "meter",
    upAxis: "Y",
};

const ConvertedUsdConventions: DemoAssetConventions = {
    handedness: "preserved",
    unit: "meter",
    upAxis: "converted",
    unitScale: 0.01,
};

const StandardGltfDomainTags: DemoDomainTags = {
    handedness: "right",
    unit: "meters",
    upAxis: "Y",
};

const UsdDomainTags: DemoDomainTags = {
    handedness: "right",
    unit: "meters",
    upAxis: "Z",
};

const GltfDracoLoss: DemoLossDiagnostic = {
    id: "gltf-draco-extension",
    feature: "Draco mesh compression",
    policy: "extension",
    extension: "KHR_draco_mesh_compression",
    severity: "info",
    why: "Geometry remains recoverable through the required glTF Draco extension.",
};

const GltfBasisuLoss: DemoLossDiagnostic = {
    id: "gltf-basisu-extension",
    feature: "Basis Universal texture compression",
    policy: "extension",
    extension: "KHR_texture_basisu",
    severity: "info",
    why: "Texture pixels remain decodable through the KTX2/BasisU glTF extension.",
};

const GltfSimplificationLoss: DemoLossDiagnostic = {
    id: "gltf-geometry-simplification",
    feature: "Source mesh detail",
    policy: "bake",
    severity: "warning",
    why: "The simplify operator intentionally bakes a lower triangle count into the exported geometry.",
};

const UsdTextureGraphLoss: DemoLossDiagnostic = {
    id: "usd-texture-graphs",
    feature: "USD texture graphs",
    policy: "drop",
    severity: "warning",
    why: "The Babylon adaptation does not preserve arbitrary USD shader graphs.",
};

const UsdLightsLoss: DemoLossDiagnostic = {
    id: "usd-lights",
    feature: "USD lights",
    policy: "drop",
    severity: "warning",
    why: "The resolved-stage adapter prunes unsupported USD light representations.",
};

const UsdCamerasLoss: DemoLossDiagnostic = {
    id: "usd-cameras",
    feature: "USD cameras",
    policy: "drop",
    severity: "warning",
    why: "The resolved-stage adapter does not carry USD camera prims into this target.",
};

const UsdSkinningAnimationLoss: DemoLossDiagnostic = {
    id: "usd-skinning-animation",
    feature: "USD skinning and animation",
    policy: "drop",
    severity: "warning",
    why: "The current Babylon adaptation does not preserve the source animation model.",
};

const UsdPointInstancingLoss: DemoLossDiagnostic = {
    id: "usd-point-instancing",
    feature: "USD point instancing",
    policy: "drop",
    severity: "warning",
    why: "Point instancing is recorded as a loss when the target scene is adapted.",
};

const UsdVariantsLoss: DemoLossDiagnostic = {
    id: "usd-variants",
    feature: "USD variants",
    policy: "drop",
    severity: "warning",
    why: "The glTF scene spine has no equivalent variant-set model.",
};

const UsdCoordinateLoss: DemoLossDiagnostic = {
    id: "usd-coordinate-conversion",
    feature: "USD Z-up and authored units",
    policy: "bake",
    severity: "warning",
    why: "The USD_Root adaptation converts source coordinates and records the applied unit scale.",
};

const BabylonCustomMaterialLoss: DemoLossDiagnostic = {
    id: "babylon-custom-material",
    feature: "Babylon custom material",
    policy: "bake",
    severity: "warning",
    why: "The Babylon material is baked to the glTF material model at export.",
};

const BabylonPhysicsLoss: DemoLossDiagnostic = {
    id: "babylon-physics-metadata",
    feature: "Babylon physics metadata",
    policy: "drop",
    severity: "info",
    why: "The glTF scene spine has no portable physics-body representation for this demo.",
};

const BabylonAnimationLoss: DemoLossDiagnostic = {
    id: "babylon-animation",
    feature: "Babylon animation metadata",
    policy: "preserve",
    severity: "info",
    why: "The selected animation is represented by glTF animation channels.",
};

const ImageResizeLoss: DemoLossDiagnostic = {
    id: "image-resize",
    feature: "Source texture resolution",
    policy: "bake",
    severity: "warning",
    why: "The image lane intentionally bakes the selected texture to a fixed working resolution.",
};

const ImageReencodeLoss: DemoLossDiagnostic = {
    id: "image-reencode",
    feature: "Source image encoding",
    policy: "bake",
    severity: "warning",
    why: "The processed image is re-encoded as WebP before it is inserted into the glTF texture slot.",
};

const NodeGeometryBakeLoss: DemoLossDiagnostic = {
    id: "node-geometry-bake",
    feature: "Procedural NodeGeometry graph",
    policy: "bake",
    severity: "info",
    why: "The visible bake node turns procedural geometry into vertex data and a realized mesh for export.",
};

const MaterialConstructionLoss: DemoLossDiagnostic = {
    id: "material-slot-construction",
    feature: "Source material assignment",
    policy: "bake",
    severity: "info",
    why: "The material-construction block creates a portable glTF PBR material from semantic image bindings.",
};

const UsdAdaptationLosses = [UsdTextureGraphLoss, UsdLightsLoss, UsdCamerasLoss, UsdSkinningAnimationLoss, UsdPointInstancingLoss, UsdVariantsLoss] as const;

const ToyCarUsdzResource = CreateUsdResource("toycar-usdz", "Bundled ToyCar USDZ fixture", "toycar-usdz", "scenes/nodeAssets/toycar.usdz", DemoUsdFixtureFormat.USDZ, [
    ...UsdAdaptationLosses,
    UsdCoordinateLoss,
]);

const ToyCarUsdaResource = CreateUsdResource("toycar-usda", "Bundled ToyCar USDA fixture", "toycar-usda", "scenes/nodeAssets/toycar.usda", DemoUsdFixtureFormat.USDA, [
    ...UsdAdaptationLosses,
    UsdCoordinateLoss,
]);

const OrbGltfResource = CreateGltfResource("orb-gltf", "Bundled energy orb glTF", "orb-glb", "scenes/nodeAssets/orb.glb");

const NodeGeometryBoxResource = CreateNodeGeometryResource("box-geometry", "NodeGeometry box definition", { kind: "snippet", snippetId: "PYY6XE#69" }, "PYY6XE#69");

const UsdToGltfLosses = [...UsdAdaptationLosses, UsdCoordinateLoss] as const;
const UsdToBabylonLosses = [...UsdAdaptationLosses, UsdCoordinateLoss, BabylonCustomMaterialLoss] as const;

const DemoGltfOptimizeGraph = CreateSerializedNodeAssetGraph(
    "gltf-optimize-draco-basisu",
    [
        { customType: "ImportGLTFBlock", id: 1, name: "Import glTF", data: null, source: "scenes/nodeAssets/orb.glb" },
        { customType: "SimplifyBlock", id: 2, name: "Simplify geometry", ratio: 0.5, error: 0.001 },
        { customType: "KTX2CompressionBlock", id: 3, name: "BasisU textures", generateMipmaps: true },
        { customType: "DracoCompressionBlock", id: 4, name: "Draco geometry", method: 1, encodeSpeed: 5, decodeSpeed: 5, quantizationBits: null },
        { customType: "PruneBlock", id: 5, name: "Prune unused data", keepLeaves: false, keepAttributes: false },
        { customType: "ExportGLTFBlock", id: 6, name: "Export optimized glTF" },
    ],
    [
        { fromBlock: 1, fromPoint: "output", toBlock: 2, toPoint: "input" },
        { fromBlock: 2, fromPoint: "output", toBlock: 3, toPoint: "input" },
        { fromBlock: 3, fromPoint: "output", toBlock: 4, toPoint: "input" },
        { fromBlock: 4, fromPoint: "output", toBlock: 5, toPoint: "input" },
        { fromBlock: 5, fromPoint: "output", toBlock: 6, toPoint: "input" },
    ]
);

const DemoTextureRoundTripGraph = CreateSerializedNodeAssetGraph(
    "texture-extract-process-reinsert",
    [
        { customType: "ImportGLTFBlock", id: 1, name: "Import textured glTF", data: null, source: "scenes/nodeAssets/orb.glb" },
        { customType: "Selector", id: 2, name: "Base-color slot", pointer: "/materials/0/pbrMetallicRoughness/baseColorTexture" },
        { customType: "ExtractTexture", id: 3, name: "Extract base color" },
        { customType: "ResizeImageBlock", id: 4, name: "Resize image", width: 512, height: 512 },
        { customType: "ConvertImageFormatBlock", id: 5, name: "Convert to WebP", format: "webp", quality: 0.9 },
        { customType: "SetTexture", id: 6, name: "Reinsert base color" },
        { customType: "ExportGLTFBlock", id: 7, name: "Export processed glTF" },
    ],
    [
        { fromBlock: 1, fromPoint: "output", toBlock: 3, toPoint: "scene" },
        { fromBlock: 2, fromPoint: "output", toBlock: 3, toPoint: "pointer" },
        { fromBlock: 3, fromPoint: "output", toBlock: 4, toPoint: "input" },
        { fromBlock: 4, fromPoint: "output", toBlock: 5, toPoint: "input" },
        { fromBlock: 1, fromPoint: "output", toBlock: 6, toPoint: "scene" },
        { fromBlock: 2, fromPoint: "output", toBlock: 6, toPoint: "pointer" },
        { fromBlock: 5, fromPoint: "output", toBlock: 6, toPoint: "image" },
        { fromBlock: 6, fromPoint: "output", toBlock: 7, toPoint: "input" },
    ]
);

const DemoMaterialConstructionGraph = CreateSerializedNodeAssetGraph(
    "multi-domain-material-construction",
    [
        { customType: "ImportGLTFBlock", id: 1, name: "Import bare glTF", data: null, source: "scenes/nodeAssets/orb.glb" },
        { customType: "ImportImageBlock", id: 2, name: "Base-color image", data: null, mimeType: "image/png", source: "scenes/nodeAssets/orbMetal.png" },
        { customType: "ImportImageBlock", id: 3, name: "Normal image", data: null, mimeType: "image/png", source: "scenes/nodeAssets/orbPattern.png" },
        { customType: "ImportImageBlock", id: 4, name: "Roughness image", data: null, mimeType: "image/png", source: "scenes/nodeAssets/orbPattern.png" },
        {
            customType: "BuildPBRMaterial",
            id: 5,
            name: "Build PBR material",
            baseColorFactor: [1, 1, 1, 1],
            metallicFactor: 0.75,
            roughnessFactor: 0.35,
            emissiveFactor: [0, 0, 0],
        },
        { customType: "ExportGLTFBlock", id: 6, name: "Export material glTF" },
    ],
    [
        { fromBlock: 1, fromPoint: "output", toBlock: 5, toPoint: "scene" },
        { fromBlock: 2, fromPoint: "output", toBlock: 5, toPoint: "baseColor" },
        { fromBlock: 3, fromPoint: "output", toBlock: 5, toPoint: "normal" },
        { fromBlock: 4, fromPoint: "output", toBlock: 5, toPoint: "metallicRoughness" },
        { fromBlock: 5, fromPoint: "output", toBlock: 6, toPoint: "input" },
    ]
);

/**
 * The editor-owned demo registry. Sources are same-origin metadata and stable asset keys; the
 * controller hydrates bytes into serialized import blocks when it opens an entry.
 *
 * The USD, Babylon, and NodeGeometry adapter descriptors are intentionally declarative because
 * those runtime boundaries are not NodeAsset blocks yet. They keep the intended evaluation and
 * adaptation seams visible without serializing live stages, scenes, meshes, or NodeGeometry objects.
 */
export const DemoCatalogRegistry: DemoCatalog = {
    version: DemoCatalogSchemaVersion,
    demos: [
        {
            id: "gltf-optimize-draco-basisu",
            title: "Optimize glTF with Draco and BasisU",
            summary: "Reduce geometry and texture payloads while making extension-backed preservation visible.",
            description: "Reduce geometry and texture payloads while making extension-backed preservation visible.",
            tags: ["gltf", "optimization", "draco", "basisu"],
            resources: [OrbGltfResource],
            graph: DemoGltfOptimizeGraph,
            editor: {
                blocks: [
                    CreateEditorBlock(1, "Import glTF", 60, 240),
                    CreateEditorBlock(2, "Simplify geometry", 300, 240),
                    CreateEditorBlock(3, "BasisU textures", 540, 240),
                    CreateEditorBlock(4, "Draco geometry", 780, 240),
                    CreateEditorBlock(5, "Prune unused data", 1020, 240),
                    CreateEditorBlock(6, "Export optimized glTF", 1260, 240, "optimized-orb"),
                ],
                frames: [CreateEditorFrame("frame-optimization", "Optimization", "#2563eb", 260, 160, 1040, 220, ["2", "3", "4", "5"])],
                lossBadges: [
                    CreateLossBadge(GltfSimplificationLoss, "Geometry baked", [2]),
                    CreateLossBadge(GltfBasisuLoss, "BasisU extension", [3]),
                    CreateLossBadge(GltfDracoLoss, "Draco extension", [4]),
                ],
            },
            assets: [
                {
                    blockId: 1,
                    input: "data",
                    bundledAssetKey: "orb-glb",
                    role: DemoAssetRole.SOURCE_SCENE,
                    mimeType: "model/gltf-binary",
                    sourceLabel: "Bundled energy orb glTF",
                },
            ],
            selections: [
                CreateResolvedSelection("source-mesh", { domain: "gltf", granularity: "mesh", valueKind: "jsonPointer", value: "/meshes/0" }, "Source mesh"),
                CreateResolvedSelection("source-material", { domain: "gltf", granularity: "material", valueKind: "jsonPointer", value: "/materials/0" }, "Source material"),
                CreateEmptySelection("optional-animation", "This optimization demo has no animation selection.", "Animation"),
            ],
            terminal: { kind: "gltf", expectedMimeType: "model/gltf-binary" },
            conventions: StandardGltfConventions,
            expectedLosses: [GltfSimplificationLoss, GltfBasisuLoss, GltfDracoLoss],
            nodeGeometry: NoNodeGeometry,
            expectedOutcome: {
                description: "The optimized orb is available as a glTF preview with compressed geometry and textures.",
                assertions: ["The export contains KHR_draco_mesh_compression.", "The export contains KHR_texture_basisu."],
            },
            preExportReview: CreatePreExportReview(5, StandardGltfConventions, [GltfSimplificationLoss, GltfBasisuLoss, GltfDracoLoss]),
            teaching: {
                order: 1,
                concepts: [DemoTeachingConcept.EXPECTED_LOSSES, DemoTeachingConcept.PHYSICAL_METADATA, DemoTeachingConcept.PRE_EXPORT_REVIEW, DemoTeachingConcept.GRAPH_LAYOUT],
                takeaway: "A smaller file is still an intentional contract: inspect baked detail and extension-backed features before export.",
                focus: { frameIds: ["frame-optimization"], blockIds: [2, 3, 4, 5] },
            },
            domainTags: StandardGltfDomainTags,
        },
        {
            id: "usd-to-gltf",
            title: "USDZ to glTF",
            summary: "Resolve a bundled USDZ ToyCar stage and inspect adaptation losses before the glTF terminal.",
            description: "Resolve a bundled USDZ ToyCar stage and inspect adaptation losses before the glTF terminal.",
            tags: ["usd", "usdz", "gltf", "losses"],
            resources: [ToyCarUsdzResource],
            graph: [
                { kind: "ImportScene", id: "import-usdz", resourceId: "toycar-usdz", output: "resolvedStage" },
                { kind: "AdaptScene", id: "adapt-usdz", input: "resolvedStage", output: "gltfScene", target: "gltf" },
                { kind: "ExportScene", id: "export-usdz", input: "gltfScene", format: "gltf" },
            ],
            editor: {
                blocks: [
                    CreateEditorBlock(1, "Import USDZ", 80, 240),
                    CreateEditorBlock(2, "Adapt to glTF", 420, 240),
                    CreateEditorBlock(3, "Export glTF", 780, 240, "toycar-from-usdz"),
                ],
                frames: [CreateEditorFrame("frame-usd-adaptation", "USD adaptation", "#f59e0b", 40, 160, 760, 220, ["1", "2"])],
                lossBadges: [
                    CreateLossBadge(UsdTextureGraphLoss, "Texture graphs dropped", [2]),
                    CreateLossBadge(UsdLightsLoss, "Lights dropped", [2]),
                    CreateLossBadge(UsdCoordinateLoss, "Coordinates converted", [2]),
                ],
            },
            assets: [
                {
                    blockId: 1,
                    input: "data",
                    bundledAssetKey: "toycar-usdz",
                    role: DemoAssetRole.SOURCE_SCENE,
                    mimeType: "model/vnd.usdz+zip",
                    sourceLabel: "Bundled ToyCar USDZ fixture",
                },
            ],
            selections: [
                CreateResolvedSelection("toycar-prim", { domain: "usd", granularity: "prim", valueKind: "primPath", value: "/ToyCar/Body" }, "ToyCar body"),
                CreateStaleSelection(
                    "old-variant",
                    { domain: "usd", granularity: "variant", valueKind: "primPath", value: "/ToyCar/OldVariant" },
                    "The authored variant path is no longer present in the bundled stage.",
                    "Old variant"
                ),
                CreateDanglingSelection(
                    "missing-camera",
                    { domain: "usd", granularity: "camera", valueKind: "primPath", value: "/ToyCar/Camera" },
                    "The fixture contains no camera prim at this path.",
                    "Camera"
                ),
                CreateEmptySelection("optional-light", "This demo intentionally leaves a light selection empty.", "Light"),
            ],
            terminal: { kind: "gltf", expectedMimeType: "model/gltf-binary" },
            conventions: ConvertedUsdConventions,
            expectedLosses: UsdToGltfLosses,
            nodeGeometry: NoNodeGeometry,
            expectedOutcome: {
                description: "The adapted ToyCar is available in the glTF terminal preview with every expected USD loss visible.",
                assertions: ["The source is represented as IResolvedStage metadata.", "Loss badges are visible before export."],
            },
            preExportReview: CreatePreExportReview("adapt-usdz", ConvertedUsdConventions, UsdToGltfLosses),
            teaching: {
                order: 2,
                concepts: [
                    DemoTeachingConcept.DOMAIN_SELECTIONS,
                    DemoTeachingConcept.SELECTION_DIAGNOSTICS,
                    DemoTeachingConcept.EXPECTED_LOSSES,
                    DemoTeachingConcept.PHYSICAL_METADATA,
                    DemoTeachingConcept.PRE_EXPORT_REVIEW,
                    DemoTeachingConcept.GRAPH_LAYOUT,
                ],
                takeaway: "USD adaptation is not lossless by default: exact prim selections, coordinate conversion, and dropped features are all reviewable.",
                focus: { frameIds: ["frame-usd-adaptation"], blockIds: [1, 2] },
            },
            domainTags: UsdDomainTags,
        },
        {
            id: "usd-to-babylon-to-gltf",
            title: "USD to Babylon to glTF",
            summary: "Make the Babylon adaptation boundary explicit instead of hiding it inside a direct export.",
            description: "Make the Babylon adaptation boundary explicit instead of hiding it inside a direct export.",
            tags: ["usd", "babylon", "gltf", "adaptation"],
            resources: [ToyCarUsdaResource],
            graph: [
                { kind: "ImportScene", id: "import-usda", resourceId: "toycar-usda", output: "resolvedStage" },
                { kind: "AdaptScene", id: "adapt-babylon", input: "resolvedStage", output: "babylonScene", target: "babylon" },
                { kind: "AdaptScene", id: "adapt-gltf", input: "babylonScene", output: "gltfScene", target: "gltf" },
                { kind: "ExportScene", id: "export-babylon-gltf", input: "gltfScene", format: "gltf" },
            ],
            editor: {
                blocks: [
                    CreateEditorBlock(1, "Import USDA", 40, 240),
                    CreateEditorBlock(2, "Adapt to Babylon", 360, 240),
                    CreateEditorBlock(3, "Adapt to glTF", 700, 240),
                    CreateEditorBlock(4, "Export glTF", 1040, 240, "toycar-via-babylon"),
                ],
                frames: [CreateEditorFrame("frame-domain-boundaries", "Domain boundaries", "#7c3aed", 300, 160, 760, 220, ["2", "3"])],
                lossBadges: [
                    CreateLossBadge(UsdCoordinateLoss, "USD coordinates converted", [2]),
                    CreateLossBadge(BabylonCustomMaterialLoss, "Babylon material baked", [3]),
                    CreateLossBadge(UsdVariantsLoss, "Variants dropped", [2, 3]),
                ],
            },
            assets: [
                {
                    blockId: 1,
                    input: "data",
                    bundledAssetKey: "toycar-usda",
                    role: DemoAssetRole.SOURCE_SCENE,
                    mimeType: "model/vnd.usd",
                    sourceLabel: "Bundled ToyCar USDA fixture",
                },
            ],
            selections: [
                CreateResolvedSelection("usd-body", { domain: "usd", granularity: "prim", valueKind: "primPath", value: "/ToyCar/Body" }, "USD body"),
                CreateResolvedSelection("babylon-body", { domain: "babylon", granularity: "mesh", valueKind: "name", value: "Body" }, "Babylon body"),
                CreateStaleSelection(
                    "stale-babylon-material",
                    { domain: "babylon", granularity: "material", valueKind: "name", value: "LegacyPaint" },
                    "The Babylon adaptation renamed the material before this selection was evaluated.",
                    "Legacy material"
                ),
            ],
            terminal: { kind: "gltf", expectedMimeType: "model/gltf-binary" },
            conventions: ConvertedUsdConventions,
            expectedLosses: UsdToBabylonLosses,
            nodeGeometry: NoNodeGeometry,
            expectedOutcome: {
                description: "The ToyCar passes through an inspectable Babylon scene before it is exported to glTF.",
                assertions: ["The graph exposes a Babylon adaptation node.", "The pre-export review includes both USD and Babylon losses."],
            },
            preExportReview: CreatePreExportReview("adapt-gltf", ConvertedUsdConventions, UsdToBabylonLosses),
            teaching: {
                order: 3,
                concepts: [
                    DemoTeachingConcept.DOMAIN_SELECTIONS,
                    DemoTeachingConcept.SELECTION_DIAGNOSTICS,
                    DemoTeachingConcept.EXPECTED_LOSSES,
                    DemoTeachingConcept.PHYSICAL_METADATA,
                    DemoTeachingConcept.PRE_EXPORT_REVIEW,
                    DemoTeachingConcept.GRAPH_LAYOUT,
                ],
                takeaway: "Every domain boundary can add diagnostics; keep the intermediate Babylon adaptation visible when it matters.",
                focus: { frameIds: ["frame-domain-boundaries"], blockIds: [2, 3] },
            },
            domainTags: UsdDomainTags,
        },
        {
            id: "babylon-mutation-to-gltf",
            title: "Mutate a Babylon scene and export glTF",
            summary: "Use an exact Babylon selection to apply a mutation, then review what survives the glTF boundary.",
            description: "Use an exact Babylon selection to apply a mutation, then review what survives the glTF boundary.",
            tags: ["babylon", "mutation", "selection", "gltf"],
            resources: [CreateBabylonResource("source-babylon", "Bundled Babylon scene", "toycar-babylon", "scenes/nodeAssets/toycar.babylon")],
            graph: [
                { kind: "ImportScene", id: "import-babylon", resourceId: "source-babylon", output: "babylonScene" },
                { kind: "MutateScene", id: "mutate-babylon", input: "babylonScene", output: "mutatedBabylonScene", selectionId: "body-translation", operation: "set-property" },
                { kind: "AdaptScene", id: "adapt-mutated-babylon", input: "mutatedBabylonScene", output: "gltfScene", target: "gltf" },
                { kind: "ExportScene", id: "export-mutated-babylon", input: "gltfScene", format: "gltf" },
            ],
            editor: {
                blocks: [
                    CreateEditorBlock(1, "Import Babylon", 40, 240),
                    CreateEditorBlock(2, "Set body transform", 360, 240),
                    CreateEditorBlock(3, "Adapt to glTF", 700, 240),
                    CreateEditorBlock(4, "Export glTF", 1040, 240, "mutated-toycar"),
                ],
                frames: [CreateEditorFrame("frame-selection-mutation", "Selection and mutation", "#059669", 300, 160, 440, 220, ["1", "2"])],
                lossBadges: [
                    CreateLossBadge(BabylonCustomMaterialLoss, "Material baked", [3]),
                    CreateLossBadge(BabylonPhysicsLoss, "Physics metadata dropped", [3]),
                    CreateLossBadge(BabylonAnimationLoss, "Animation preserved", [3]),
                ],
            },
            assets: [
                {
                    blockId: 1,
                    input: "data",
                    bundledAssetKey: "toycar-babylon",
                    role: DemoAssetRole.SOURCE_SCENE,
                    mimeType: "application/json",
                    sourceLabel: "Bundled Babylon scene fixture",
                },
            ],
            selections: [
                CreateResolvedSelection("body-translation", { domain: "babylon", granularity: "node", valueKind: "name", value: "Body" }, "Body node"),
                CreateResolvedSelection("body-material", { domain: "babylon", granularity: "material", valueKind: "name", value: "Paint" }, "Paint material"),
                CreateDanglingSelection(
                    "removed-wheel",
                    { domain: "babylon", granularity: "mesh", valueKind: "name", value: "RemovedWheel" },
                    "The optional wheel is absent from the bundled fixture.",
                    "Removed wheel"
                ),
            ],
            terminal: { kind: "gltf", expectedMimeType: "model/gltf-binary" },
            conventions: StandardGltfConventions,
            expectedLosses: [BabylonCustomMaterialLoss, BabylonPhysicsLoss, BabylonAnimationLoss],
            nodeGeometry: NoNodeGeometry,
            expectedOutcome: {
                description: "The selected Babylon node is mutated and the resulting scene is available as glTF.",
                assertions: ["The body selection resolves by Babylon node name.", "The mutation remains visible in the exported scene."],
            },
            preExportReview: CreatePreExportReview("adapt-mutated-babylon", StandardGltfConventions, [BabylonCustomMaterialLoss, BabylonPhysicsLoss, BabylonAnimationLoss]),
            teaching: {
                order: 4,
                concepts: [
                    DemoTeachingConcept.DOMAIN_SELECTIONS,
                    DemoTeachingConcept.SELECTION_DIAGNOSTICS,
                    DemoTeachingConcept.EXPECTED_LOSSES,
                    DemoTeachingConcept.PRE_EXPORT_REVIEW,
                    DemoTeachingConcept.GRAPH_LAYOUT,
                ],
                takeaway: "Selections belong to their domain and need explicit stale or dangling states before a mutation is trusted.",
                focus: { frameIds: ["frame-selection-mutation"], blockIds: [1, 2] },
            },
            domainTags: { handedness: "left", unit: "meters", upAxis: "Y" },
        },
        {
            id: "node-geometry-box-to-gltf",
            title: "Evaluate NodeGeometry before export",
            summary: "Keep a NodeGeometry resource procedural until an explicit Evaluate and Bake boundary makes a mesh.",
            description: "Keep a NodeGeometry resource procedural until an explicit Evaluate and Bake boundary makes a mesh.",
            tags: ["node-geometry", "procedural", "evaluate", "gltf"],
            resources: [NodeGeometryBoxResource],
            graph: [
                { kind: "ImportNodeGeometry", id: "import-node-geometry", resourceId: "box-geometry", output: "proceduralGeometry" },
                {
                    kind: "EvaluateNodeGeometry",
                    id: "evaluate-node-geometry",
                    geometry: "proceduralGeometry",
                    output: "vertexData",
                    evaluation: { mode: "explicit", operation: "build" },
                },
                {
                    kind: "BakeNodeGeometry",
                    id: "bake-node-geometry",
                    geometry: "proceduralGeometry",
                    scene: "babylonScene",
                    meshName: "Box",
                    output: "babylonScene",
                    evaluation: { mode: "explicit", operation: "createMesh" },
                },
                { kind: "ExportScene", id: "export-node-geometry", input: "babylonScene", format: "gltf" },
            ],
            editor: {
                blocks: [
                    CreateEditorBlock(1, "Import NodeGeometry", 60, 240),
                    CreateEditorBlock(2, "Evaluate", 360, 240),
                    CreateEditorBlock(3, "Bake mesh", 660, 240),
                    CreateEditorBlock(4, "Export glTF", 960, 240, "node-geometry-box"),
                ],
                frames: [CreateEditorFrame("frame-explicit-evaluation", "Explicit evaluation", "#dc2626", 300, 160, 660, 220, ["2", "3"])],
                lossBadges: [CreateLossBadge(NodeGeometryBakeLoss, "Bake boundary", [3])],
            },
            assets: [],
            selections: [
                CreateResolvedSelection("box-output", { domain: "babylon", granularity: "mesh", valueKind: "name", value: "Box" }, "Realized box"),
                CreateEmptySelection("optional-parent", "The box is realized at the scene root.", "Parent"),
            ],
            terminal: { kind: "gltf", expectedMimeType: "model/gltf-binary" },
            conventions: StandardGltfConventions,
            expectedLosses: [NodeGeometryBakeLoss],
            nodeGeometry: {
                status: "requires-adapter",
                proceduralUntil: "BakeNodeGeometry",
                target: { name: "Box" },
                why: "The NodeGeometry adapter must call build() and only then createMesh(name, scene); parsing the resource alone must not attach a mesh.",
            },
            expectedOutcome: {
                description: "A visible Box mesh is realized from serialized NodeGeometry and exported as glTF.",
                assertions: ["ImportNodeGeometry remains procedural.", "EvaluateNodeGeometry is explicit.", "BakeNodeGeometry is the attachment boundary."],
            },
            preExportReview: CreatePreExportReview("bake-node-geometry", StandardGltfConventions, [NodeGeometryBakeLoss]),
            teaching: {
                order: 5,
                concepts: [
                    DemoTeachingConcept.NODE_GEOMETRY_EVALUATION,
                    DemoTeachingConcept.EXPECTED_LOSSES,
                    DemoTeachingConcept.PHYSICAL_METADATA,
                    DemoTeachingConcept.PRE_EXPORT_REVIEW,
                    DemoTeachingConcept.GRAPH_LAYOUT,
                ],
                takeaway: "A serialized NodeGeometry definition is a resource, not a scene; only a visible evaluation/bake node creates exportable geometry.",
                focus: { frameIds: ["frame-explicit-evaluation"], blockIds: [1, 2, 3] },
            },
            domainTags: StandardGltfDomainTags,
        },
        {
            id: "texture-extract-process-reinsert",
            title: "Extract, process, and reinsert a texture",
            summary: "Treat image data as a semantic binding while a texture slot stays an exact glTF selection.",
            description: "Treat image data as a semantic binding while a texture slot stays an exact glTF selection.",
            tags: ["gltf", "image", "texture", "bindings"],
            resources: [OrbGltfResource],
            graph: DemoTextureRoundTripGraph,
            editor: {
                blocks: [
                    CreateEditorBlock(1, "Import textured glTF", 40, 260),
                    CreateEditorBlock(2, "Base-color slot", 300, 80),
                    CreateEditorBlock(3, "Extract base color", 540, 260),
                    CreateEditorBlock(4, "Resize image", 780, 260),
                    CreateEditorBlock(5, "Convert to WebP", 1020, 260),
                    CreateEditorBlock(6, "Reinsert base color", 1260, 260),
                    CreateEditorBlock(7, "Export processed glTF", 1500, 260, "processed-orb"),
                ],
                frames: [CreateEditorFrame("frame-image-lane", "Image lane", "#0891b2", 500, 160, 820, 220, ["3", "4", "5", "6"])],
                lossBadges: [CreateLossBadge(ImageResizeLoss, "Resolution baked", [4]), CreateLossBadge(ImageReencodeLoss, "WebP re-encode", [5])],
            },
            assets: [
                {
                    blockId: 1,
                    input: "data",
                    bundledAssetKey: "orb-glb",
                    role: DemoAssetRole.SOURCE_SCENE,
                    mimeType: "model/gltf-binary",
                    sourceLabel: "Bundled textured orb glTF",
                },
            ],
            selections: [
                CreateResolvedSelection(
                    "base-color-slot",
                    { domain: "gltf", granularity: "texture", valueKind: "jsonPointer", value: "/materials/0/pbrMetallicRoughness/baseColorTexture" },
                    "Base-color texture slot"
                ),
                CreateStaleSelection(
                    "old-normal-slot",
                    { domain: "gltf", granularity: "texture", valueKind: "jsonPointer", value: "/materials/0/normalTexture" },
                    "The source fixture does not contain the optional normal slot.",
                    "Old normal slot"
                ),
                CreateEmptySelection("optional-mask", "This round trip edits only the base-color slot.", "Mask"),
            ],
            terminal: { kind: "gltf", expectedMimeType: "model/gltf-binary" },
            conventions: StandardGltfConventions,
            expectedLosses: [ImageResizeLoss, ImageReencodeLoss],
            nodeGeometry: NoNodeGeometry,
            expectedOutcome: {
                description: "The selected base-color image is resized and re-encoded before being written back into the glTF scene.",
                assertions: ["The image path is represented by bindings.", "The output texture slot remains the exact selected slot."],
            },
            preExportReview: CreatePreExportReview(6, StandardGltfConventions, [ImageResizeLoss, ImageReencodeLoss]),
            teaching: {
                order: 6,
                concepts: [
                    DemoTeachingConcept.DOMAIN_SELECTIONS,
                    DemoTeachingConcept.SELECTION_DIAGNOSTICS,
                    DemoTeachingConcept.IMAGE_BINDINGS,
                    DemoTeachingConcept.EXPECTED_LOSSES,
                    DemoTeachingConcept.PRE_EXPORT_REVIEW,
                    DemoTeachingConcept.GRAPH_LAYOUT,
                ],
                takeaway: "Image payloads are semantic bindings, while the texture slot they modify remains a domain-owned exact selection.",
                focus: { frameIds: ["frame-image-lane"], blockIds: [2, 3, 4, 5, 6] },
            },
            domainTags: StandardGltfDomainTags,
        },
        {
            id: "mixed-gltf-node-geometry-composition",
            title: "Compose glTF with NodeGeometry",
            summary: "Adapt a glTF scene to Babylon, explicitly realize procedural geometry, and compose the result.",
            description: "Adapt a glTF scene to Babylon, explicitly realize procedural geometry, and compose the result.",
            tags: ["gltf", "node-geometry", "composition", "babylon"],
            resources: [OrbGltfResource, NodeGeometryBoxResource],
            graph: [
                { kind: "ImportScene", id: "import-composition-gltf", resourceId: "orb-gltf", output: "gltfScene" },
                { kind: "AdaptScene", id: "adapt-composition-babylon", input: "gltfScene", output: "babylonScene", target: "babylon" },
                { kind: "ImportNodeGeometry", id: "import-composition-geometry", resourceId: "box-geometry", output: "proceduralGeometry" },
                {
                    kind: "EvaluateNodeGeometry",
                    id: "evaluate-composition-geometry",
                    geometry: "proceduralGeometry",
                    output: "vertexData",
                    evaluation: { mode: "explicit", operation: "build" },
                },
                {
                    kind: "BakeNodeGeometry",
                    id: "bake-composition-geometry",
                    geometry: "proceduralGeometry",
                    scene: "babylonScene",
                    meshName: "ComposedBox",
                    output: "babylonScene",
                    evaluation: { mode: "explicit", operation: "createMesh" },
                },
                { kind: "ExportScene", id: "export-composition", input: "babylonScene", format: "gltf" },
            ],
            editor: {
                blocks: [
                    CreateEditorBlock(1, "Import glTF", 40, 220),
                    CreateEditorBlock(2, "Adapt to Babylon", 320, 220),
                    CreateEditorBlock(3, "Import NodeGeometry", 40, 520),
                    CreateEditorBlock(4, "Evaluate", 320, 520),
                    CreateEditorBlock(5, "Bake ComposedBox", 620, 360),
                    CreateEditorBlock(6, "Export glTF", 960, 360, "orb-with-box"),
                ],
                frames: [
                    CreateEditorFrame("frame-source-adaptation", "Source adaptation", "#7c3aed", 280, 140, 300, 180, ["1", "2"]),
                    CreateEditorFrame("frame-procedural-geometry", "Procedural geometry", "#dc2626", 0, 440, 560, 200, ["3", "4"]),
                ],
                lossBadges: [CreateLossBadge(NodeGeometryBakeLoss, "Explicit geometry bake", [5])],
            },
            assets: [
                {
                    blockId: 1,
                    input: "data",
                    bundledAssetKey: "orb-glb",
                    role: DemoAssetRole.SOURCE_SCENE,
                    mimeType: "model/gltf-binary",
                    sourceLabel: "Bundled energy orb glTF",
                },
            ],
            selections: [
                CreateResolvedSelection("composition-parent", { domain: "babylon", granularity: "scene", valueKind: "name", value: "babylonScene" }, "Babylon scene"),
                CreateResolvedSelection("composed-box", { domain: "babylon", granularity: "mesh", valueKind: "name", value: "ComposedBox" }, "Composed box"),
                CreateEmptySelection("optional-placement", "The procedural box is created at the scene root.", "Placement"),
            ],
            terminal: { kind: "gltf", expectedMimeType: "model/gltf-binary" },
            conventions: StandardGltfConventions,
            expectedLosses: [NodeGeometryBakeLoss],
            nodeGeometry: {
                status: "requires-adapter",
                proceduralUntil: "BakeNodeGeometry",
                target: { name: "ComposedBox", parentPointer: "/scene" },
                why: "The scene adapter must evaluate NodeGeometry explicitly before attaching the realized mesh to the Babylon composition.",
            },
            expectedOutcome: {
                description: "The orb and an explicitly realized ComposedBox are exported together as one glTF scene.",
                assertions: ["The NodeGeometry resource never becomes a scene by itself.", "The final scene contains both source and realized geometry."],
            },
            preExportReview: CreatePreExportReview("bake-composition-geometry", StandardGltfConventions, [NodeGeometryBakeLoss]),
            teaching: {
                order: 7,
                concepts: [
                    DemoTeachingConcept.NODE_GEOMETRY_EVALUATION,
                    DemoTeachingConcept.DOMAIN_SELECTIONS,
                    DemoTeachingConcept.EXPECTED_LOSSES,
                    DemoTeachingConcept.PHYSICAL_METADATA,
                    DemoTeachingConcept.PRE_EXPORT_REVIEW,
                    DemoTeachingConcept.GRAPH_LAYOUT,
                ],
                takeaway: "Composition is explicit: a scene can receive procedural geometry only after evaluation and realization.",
                focus: { frameIds: ["frame-source-adaptation", "frame-procedural-geometry"], blockIds: [2, 4, 5] },
            },
            domainTags: StandardGltfDomainTags,
        },
        {
            id: "multi-domain-material-construction",
            title: "Construct a material from domain bindings",
            summary: "Build a portable PBR material from semantic image roles instead of inventing image resource subtypes.",
            description: "Build a portable PBR material from semantic image roles instead of inventing image resource subtypes.",
            tags: ["gltf", "materials", "pbr", "image-bindings"],
            resources: [OrbGltfResource],
            graph: DemoMaterialConstructionGraph,
            editor: {
                blocks: [
                    CreateEditorBlock(1, "Import bare glTF", 40, 240),
                    CreateEditorBlock(2, "Base-color image", 340, 80),
                    CreateEditorBlock(3, "Normal image", 340, 240),
                    CreateEditorBlock(4, "Roughness image", 340, 400),
                    CreateEditorBlock(5, "Build PBR material", 700, 240),
                    CreateEditorBlock(6, "Export material glTF", 1060, 240, "material-orb"),
                ],
                frames: [CreateEditorFrame("frame-material-bindings", "Semantic image bindings", "#0f766e", 280, 20, 360, 500, ["2", "3", "4"])],
                lossBadges: [CreateLossBadge(MaterialConstructionLoss, "Material baked", [5])],
            },
            assets: [
                {
                    blockId: 1,
                    input: "data",
                    bundledAssetKey: "orb-glb",
                    role: DemoAssetRole.SOURCE_SCENE,
                    mimeType: "model/gltf-binary",
                    sourceLabel: "Bundled bare orb glTF",
                },
                {
                    blockId: 2,
                    input: "data",
                    bundledAssetKey: "orb-metal",
                    role: DemoAssetRole.BASE_COLOR,
                    mimeType: "image/png",
                    sourceLabel: "Bundled metal base-color image",
                },
                {
                    blockId: 3,
                    input: "data",
                    bundledAssetKey: "orb-pattern",
                    role: DemoAssetRole.NORMAL,
                    mimeType: "image/png",
                    sourceLabel: "Bundled pattern normal image",
                },
                {
                    blockId: 4,
                    input: "data",
                    bundledAssetKey: "orb-pattern",
                    role: DemoAssetRole.ROUGHNESS,
                    mimeType: "image/png",
                    sourceLabel: "Bundled pattern roughness image",
                },
            ],
            selections: [
                CreateResolvedSelection("material-target", { domain: "gltf", granularity: "mesh", valueKind: "jsonPointer", value: "/meshes/0" }, "Material target mesh"),
                CreateResolvedSelection(
                    "base-color-role",
                    { domain: "gltf", granularity: "texture", valueKind: "jsonPointer", value: "/materials/0/pbrMetallicRoughness/baseColorTexture" },
                    "Base-color role"
                ),
                CreateEmptySelection("optional-emissive", "This material intentionally leaves the emissive role unbound.", "Emissive"),
            ],
            terminal: { kind: "gltf", expectedMimeType: "model/gltf-binary" },
            conventions: StandardGltfConventions,
            expectedLosses: [MaterialConstructionLoss],
            nodeGeometry: NoNodeGeometry,
            expectedOutcome: {
                description: "The imported mesh receives a portable glTF PBR material populated from semantic image bindings.",
                assertions: ["Base-color, normal, and roughness bindings are distinct.", "No image subtype is used as a resource kind."],
            },
            preExportReview: CreatePreExportReview(5, StandardGltfConventions, [MaterialConstructionLoss]),
            teaching: {
                order: 8,
                concepts: [
                    DemoTeachingConcept.IMAGE_BINDINGS,
                    DemoTeachingConcept.DOMAIN_SELECTIONS,
                    DemoTeachingConcept.EXPECTED_LOSSES,
                    DemoTeachingConcept.PHYSICAL_METADATA,
                    DemoTeachingConcept.PRE_EXPORT_REVIEW,
                    DemoTeachingConcept.GRAPH_LAYOUT,
                ],
                takeaway: "Images carry semantic roles at bindings, and material construction makes the final portable slots visible before export.",
                focus: { frameIds: ["frame-material-bindings"], blockIds: [2, 3, 4, 5] },
            },
            domainTags: StandardGltfDomainTags,
        },
    ],
};
