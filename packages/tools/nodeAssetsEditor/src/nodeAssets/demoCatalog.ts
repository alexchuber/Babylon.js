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
export type DemoResourceSource = DemoUrlSource | DemoSnippetSource | DemoInlineSource | DemoInlineJsonSource | DemoFileSource;

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

/** A glTF, USD, or Babylon scene resource. */
export type DemoSceneResource = DemoResourceBase & {
    readonly kind: DemoSceneRepresentation;
};

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
    readonly geometry: string;
    readonly scene: string;
    readonly meshName: string;
    readonly evaluation: {
        readonly mode: "explicit";
        readonly operation: "createMesh";
    };
};

/** Declarative node descriptor accepted by a demo graph. */
export type DemoGraphNode = DemoImportNodeGeometryNode | DemoEvaluateNodeGeometryNode | DemoBakeNodeGeometryNode;

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
 * use {@link IsRealizeNodeGeometryNode} to inspect its explicit evaluation
 * boundary.
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
