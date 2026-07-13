import { describe, expect, it } from "vitest";

import {
    DemoCatalogSchemaVersion,
    DemoCatalogDemoCount,
    DemoCatalogEntries,
    DemoCatalogRegistry,
    DemoAssetRole,
    DemoLossPolicy,
    DemoResourceKind,
    DemoTeachingConcept,
    DemoUsdFixtureFormat,
    BuildDemoCatalogViewModels,
    GetDemoCatalogEntry,
    IsBakeNodeGeometryNode,
    IsEvaluateNodeGeometryNode,
    IsNodeGeometryResource,
    type DemoCatalog,
    type DemoGraphNode,
    type DemoLossDiagnostic,
    type DemoNodeGeometryResource,
} from "../../src/nodeAssets/demoCatalog";

const nodeGeometryResource: DemoNodeGeometryResource = {
    id: "geometry",
    label: "Generated geometry",
    kind: DemoResourceKind.NODE_GEOMETRY,
    format: "babylon-node-geometry",
    source: { kind: "snippet", snippetId: "PYY6XE#69" },
};

const inlineNodeGeometryResource: DemoNodeGeometryResource = {
    id: "inline-geometry",
    label: "Inline generated geometry",
    kind: DemoResourceKind.NODE_GEOMETRY,
    format: "babylon-node-geometry",
    source: {
        kind: "inlineJson",
        json: { blocks: [], metadata: { name: "box" } },
    },
};

const usdAdaptationLosses: readonly DemoLossDiagnostic[] = [
    {
        id: "usd-texture-graphs",
        feature: "USD texture graphs",
        policy: DemoLossPolicy.DROP,
        severity: "warning",
        why: "The Babylon adaptation does not preserve arbitrary USD shader graphs.",
    },
    {
        id: "usd-lights",
        feature: "USD lights",
        policy: DemoLossPolicy.DROP,
        severity: "warning",
        why: "The resolved-stage adapter prunes unsupported USD light representations.",
    },
    {
        id: "usd-cameras",
        feature: "USD cameras",
        policy: DemoLossPolicy.DROP,
        severity: "warning",
        why: "The resolved-stage adapter does not carry USD camera prims into this target.",
    },
    {
        id: "usd-skinning-animation",
        feature: "USD skinning and animation",
        policy: DemoLossPolicy.DROP,
        severity: "warning",
        why: "The current Babylon adaptation does not preserve the source animation model.",
    },
    {
        id: "usd-point-instancing",
        feature: "USD point instancing",
        policy: DemoLossPolicy.DROP,
        severity: "warning",
        why: "Point instancing is recorded as a loss when the target scene is adapted.",
    },
    {
        id: "usd-variants",
        feature: "USD variants",
        policy: DemoLossPolicy.DROP,
        severity: "warning",
        why: "The glTF scene spine has no equivalent variant-set model.",
    },
];

const expectedLosses: readonly DemoLossDiagnostic[] = [
    ...usdAdaptationLosses,
    {
        id: "custom-material-metadata",
        feature: "Custom material metadata",
        policy: DemoLossPolicy.EXTENSION,
        extension: "EXT_demo_metadata",
        severity: "info",
        why: "The metadata is carried in a target extension.",
    },
];

const catalog: DemoCatalog = {
    version: DemoCatalogSchemaVersion,
    selectionParity: [
        {
            ownerRepresentation: "gltf",
            status: "supported",
            targetTypes: ["scene", "node", "mesh", "primitive", "material", "texture", "animation", "skin", "camera", "light", "variant"],
            why: "The glTF adapter owns exact JSON-pointer selections.",
        },
        {
            ownerRepresentation: "usd",
            status: "supported",
            targetTypes: ["stage", "prim", "property", "material", "texture", "animation", "camera", "light", "variant"],
            why: "The USD adapter owns exact stage selections.",
        },
        {
            ownerRepresentation: "babylon",
            status: "requires-adapter",
            targetTypes: ["scene", "node", "mesh", "material", "texture", "animation", "camera", "light"],
            why: "Babylon needs an owned selection adapter.",
        },
    ],
    demos: [
        {
            id: "usd-to-gltf",
            title: "USD to glTF",
            summary: "Transcode a USD scene to the glTF scene spine.",
            description: "Transcode a USD scene to the glTF scene spine.",
            tags: ["usd", "gltf", "transcoding"],
            availability: { status: "available" },
            resourceLanes: [
                {
                    id: "source-lane",
                    label: "Source scene",
                    resourceIds: ["source"],
                    assetBindingIds: ["orb-metal-image"],
                    textureBindingIds: [],
                    diagnostics: [],
                },
                {
                    id: "procedural-lane",
                    label: "Procedural geometry",
                    resourceIds: ["geometry", "inline-geometry"],
                    assetBindingIds: [],
                    textureBindingIds: [],
                    diagnostics: [],
                },
            ],
            resources: [
                {
                    id: "source",
                    label: "Source scene",
                    kind: DemoResourceKind.USD,
                    format: DemoUsdFixtureFormat.USDZ,
                    source: {
                        kind: "bundled",
                        assetKey: "toy-car-usdz",
                        path: "scenes/nodeAssets/toy-car.usdz",
                        mimeType: "model/vnd.usdz+zip",
                        sourceLabel: "Bundled ToyCar USDZ fixture",
                        origin: "same-origin",
                    },
                    resolvedStage: {
                        representation: "IResolvedStage",
                        sourceFormat: DemoUsdFixtureFormat.USDZ,
                    },
                    adaptation: {
                        target: "babylon",
                        losses: usdAdaptationLosses,
                    },
                    expectedLosses: usdAdaptationLosses,
                    domainTags: {
                        handedness: "right",
                        unit: "meters",
                        upAxis: "Y",
                    },
                },
                nodeGeometryResource,
                inlineNodeGeometryResource,
            ],
            graph: [
                {
                    kind: "ImportNodeGeometry",
                    resourceId: "geometry",
                    output: "proceduralGeometry",
                },
                {
                    kind: "EvaluateNodeGeometry",
                    geometry: "proceduralGeometry",
                    output: "vertexData",
                    evaluation: {
                        mode: "explicit",
                        operation: "build",
                    },
                },
                {
                    kind: "BakeNodeGeometry",
                    geometry: "proceduralGeometry",
                    scene: "babylonScene",
                    meshName: "Box",
                    evaluation: {
                        mode: "explicit",
                        operation: "createMesh",
                    },
                },
            ],
            editor: {
                blocks: [],
                frames: [],
                lossBadges: [
                    {
                        diagnosticId: "usd-variants",
                        label: "Variants dropped",
                        severity: "warning",
                        graphNodeIds: [1],
                    },
                    {
                        diagnosticId: "custom-material-metadata",
                        label: "Metadata extension",
                        severity: "info",
                        graphNodeIds: [2],
                    },
                ],
            },
            assets: [
                {
                    id: "orb-metal-image",
                    blockId: 3,
                    input: "baseColor",
                    bundledAssetKey: "orb-metal",
                    role: DemoAssetRole.BASE_COLOR,
                    mimeType: "image/png",
                    sourceLabel: "Bundled orb metal image",
                },
            ],
            selections: [
                {
                    id: "usd-prim",
                    label: "Orb prim",
                    resolution: {
                        status: "resolved",
                        selection: {
                            domain: "usd",
                            granularity: "prim",
                            valueKind: "primPath",
                            value: "/Root/Orb",
                        },
                    },
                    pill: {
                        ownerRepresentation: "usd",
                        targetType: "prim",
                        cardinality: "one",
                        status: "resolved",
                    },
                },
                {
                    id: "usd-variant",
                    resolution: {
                        status: "stale",
                        selection: {
                            domain: "usd",
                            granularity: "variant",
                            valueKind: "primPath",
                            value: "/Root/OldVariant",
                        },
                        diagnostic: {
                            status: "stale",
                            why: "The fixture changed after the selection was authored.",
                        },
                    },
                    pill: {
                        ownerRepresentation: "usd",
                        targetType: "variant",
                        cardinality: "one",
                        status: "stale",
                    },
                },
                {
                    id: "usd-missing-property",
                    resolution: {
                        status: "dangling",
                        selection: {
                            domain: "usd",
                            granularity: "property",
                            valueKind: "propertyPath",
                            value: "/Root/Orb.visibility",
                        },
                        diagnostic: {
                            status: "dangling",
                            why: "The property does not exist in this stage.",
                        },
                    },
                    pill: {
                        ownerRepresentation: "usd",
                        targetType: "property",
                        cardinality: "one",
                        status: "dangling",
                    },
                },
                {
                    id: "optional-camera",
                    resolution: {
                        status: "empty",
                        diagnostic: {
                            status: "empty",
                            why: "This demo intentionally leaves camera selection unset.",
                        },
                    },
                    pill: {
                        ownerRepresentation: "usd",
                        targetType: "camera",
                        cardinality: "one",
                        status: "empty",
                    },
                },
            ],
            textureBindings: [],
            materialTargets: [],
            selectionOwners: ["usd"],
            terminal: {
                kind: "gltf",
                expectedMimeType: "model/gltf-binary",
            },
            conventions: {
                handedness: "preserved",
                unit: "meter",
                upAxis: "converted",
                unitScale: 0.01,
            },
            expectedLosses,
            domainTags: {
                handedness: "right",
                unit: "meters",
                upAxis: "Y",
            },
            nodeGeometry: {
                status: "requires-adapter",
                proceduralUntil: "BakeNodeGeometry",
                why: "The catalog can describe the visible evaluation boundary before a runtime adapter exists.",
            },
            expectedOutcome: {
                description: "The converted scene is available in the glTF terminal preview.",
            },
            preExportReview: {
                visibility: "before-terminal-export",
                beforeExportNodeId: 4,
                physicalMetadata: {
                    handedness: "preserved",
                    unit: "meter",
                    upAxis: "converted",
                    unitScale: 0.01,
                },
                accumulatedLosses: expectedLosses,
            },
            teaching: {
                order: 1,
                concepts: [
                    DemoTeachingConcept.DOMAIN_SELECTIONS,
                    DemoTeachingConcept.SELECTION_DIAGNOSTICS,
                    DemoTeachingConcept.EXPECTED_LOSSES,
                    DemoTeachingConcept.IMAGE_BINDINGS,
                    DemoTeachingConcept.NODE_GEOMETRY_EVALUATION,
                    DemoTeachingConcept.PRE_EXPORT_REVIEW,
                    DemoTeachingConcept.GRAPH_LAYOUT,
                ],
                takeaway: "Inspect exact source selections, visible losses, and physical metadata before export.",
                focus: {
                    frameIds: ["frame-source", "frame-export"],
                    blockIds: [1, 2, 3, 4],
                },
            },
        },
    ],
};

describe("demo catalog schema", () => {
    it("supports structured expected-loss diagnostics and domain tags", () => {
        const demo = catalog.demos[0];

        expect(demo.expectedLosses).toHaveLength(7);
        expect(demo.expectedLosses[0]).toMatchObject({
            policy: "drop",
            severity: "warning",
        });
        const usdResource = demo.resources[0];
        expect(usdResource).toMatchObject({
            format: "usdz",
            source: {
                kind: "bundled",
                origin: "same-origin",
            },
            resolvedStage: {
                representation: "IResolvedStage",
            },
            adaptation: {
                target: "babylon",
                losses: usdAdaptationLosses,
            },
        });
        expect(demo.domainTags).toEqual({
            handedness: "right",
            unit: "meters",
            upAxis: "Y",
        });
        expect(demo.conventions).toMatchObject({
            upAxis: "converted",
            unitScale: 0.01,
        });
        expect(demo.selections.map(({ resolution }) => resolution.status)).toEqual(["resolved", "stale", "dangling", "empty"]);
        expect(demo.editor.lossBadges).toMatchObject([
            { diagnosticId: "usd-variants", severity: "warning" },
            { diagnosticId: "custom-material-metadata", severity: "info" },
        ]);
        expect(demo.preExportReview).toMatchObject({
            visibility: "before-terminal-export",
            beforeExportNodeId: 4,
            accumulatedLosses: expectedLosses,
        });
    });

    it("treats NodeGeometry as procedural until an explicit evaluation or bake node", () => {
        expect(IsNodeGeometryResource(nodeGeometryResource)).toBe(true);
        expect("evaluation" in nodeGeometryResource).toBe(false);
        expect(inlineNodeGeometryResource.source).toEqual({
            kind: "inlineJson",
            json: { blocks: [], metadata: { name: "box" } },
        });

        const graph = catalog.demos[0].graph as readonly DemoGraphNode[];
        const evaluation = graph[1];
        if (!IsEvaluateNodeGeometryNode(evaluation)) {
            throw new Error("Expected an explicit NodeGeometry evaluation node");
        }
        expect(evaluation.evaluation).toEqual({
            mode: "explicit",
            operation: "build",
        });
        const bake = graph[2];
        if (!IsBakeNodeGeometryNode(bake)) {
            throw new Error("Expected an explicit NodeGeometry bake node");
        }
        expect(bake.evaluation).toEqual({
            mode: "explicit",
            operation: "createMesh",
        });
        expect(catalog.demos[0].nodeGeometry).toMatchObject({
            status: "requires-adapter",
            proceduralUntil: "BakeNodeGeometry",
        });
    });

    it("exports the complete eight-demo teaching registry", () => {
        expect(DemoCatalogRegistry.version).toBe(DemoCatalogSchemaVersion);
        expect(DemoCatalogRegistry.demos).toHaveLength(DemoCatalogDemoCount);
        expect(new Set(DemoCatalogRegistry.demos.map(({ id }) => id)).size).toBe(DemoCatalogDemoCount);
        expect(DemoCatalogRegistry.demos.map(({ teaching }) => teaching.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);

        for (const demo of DemoCatalogRegistry.demos) {
            const lossIds = new Set(demo.expectedLosses.map(({ id }) => id));
            const badgeIds = demo.editor.lossBadges.map(({ diagnosticId }) => diagnosticId);
            const reviewIds = demo.preExportReview.accumulatedLosses.map(({ id }) => id);

            expect(badgeIds.every((id) => lossIds.has(id))).toBe(true);
            expect(new Set(reviewIds)).toEqual(lossIds);
            expect(demo.teaching.concepts).toContain(DemoTeachingConcept.EXPECTED_LOSSES);
            expect(demo.teaching.concepts).toContain(DemoTeachingConcept.PRE_EXPORT_REVIEW);
            expect(demo.editor.frames.map(({ id }) => id)).toEqual(expect.arrayContaining([...demo.teaching.focus.frameIds]));
            expect(demo.selections.every(({ resolution, pill }) => resolution.status === pill.status)).toBe(true);
            expect(demo.selections.every(({ pill }) => demo.selectionOwners.includes(pill.ownerRepresentation))).toBe(true);
            if (demo.selectionOwners.includes("babylon")) {
                expect(demo.availability.status).toBe("requires-selection-adapter");
            }

            const resourceIds = new Set(demo.resources.map(({ id }) => id));
            const assetBindingIds = new Set(demo.assets.map(({ id }) => id));
            const textureBindingIds = new Set(demo.textureBindings.map(({ id }) => id));
            const selectionIds = new Set(demo.selections.map(({ id }) => id));
            for (const lane of demo.resourceLanes) {
                expect(lane.resourceIds.every((id) => resourceIds.has(id))).toBe(true);
                expect(lane.assetBindingIds.every((id) => assetBindingIds.has(id))).toBe(true);
                expect(lane.textureBindingIds.every((id) => textureBindingIds.has(id))).toBe(true);
            }
            expect(
                demo.textureBindings.every(({ source, target }) => {
                    const sourceExists = source.kind === "assetBinding" ? assetBindingIds.has(source.assetBindingId) : true;
                    return sourceExists && selectionIds.has(target.selectionId);
                })
            ).toBe(true);
        }

        const usdDemo = DemoCatalogRegistry.demos.find(({ id }) => id === "usd-to-gltf")!;
        expect(usdDemo.resources[0]).toMatchObject({
            kind: DemoResourceKind.USD,
            format: DemoUsdFixtureFormat.USDZ,
            source: { kind: "bundled", origin: "same-origin", assetKey: "toycar-usdz" },
            resolvedStage: { representation: "IResolvedStage" },
        });
        expect(usdDemo.conventions).toEqual({
            handedness: "preserved",
            unit: "converted",
            upAxis: "converted",
            unitScale: 0.01,
        });

        const nodeGeometryDemo = DemoCatalogRegistry.demos.find(({ id }) => id === "node-geometry-box-to-gltf")!;
        const nodeGeometryGraph = nodeGeometryDemo.graph as readonly DemoGraphNode[];
        expect(nodeGeometryGraph.map(({ kind }) => kind)).toEqual(["ImportNodeGeometry", "EvaluateNodeGeometry", "BakeNodeGeometry", "ExportScene"]);
        expect(nodeGeometryDemo.nodeGeometry.status).toBe("requires-adapter");
        expect(nodeGeometryDemo.nodeGeometry.proceduralUntil).toBe("BakeNodeGeometry");

        const selectionStatuses = DemoCatalogRegistry.demos.flatMap((demo) => demo.selections.map(({ resolution }) => resolution.status));
        expect(selectionStatuses).toEqual(expect.arrayContaining(["resolved", "stale", "dangling", "empty"]));

        const imageRoles = DemoCatalogRegistry.demos.flatMap((demo) => [
            ...demo.assets.filter(({ role }) => role !== DemoAssetRole.SOURCE_SCENE).map(({ role }) => role),
            ...demo.textureBindings.map(({ role }) => role),
        ]);
        expect(imageRoles).toEqual(expect.arrayContaining([DemoAssetRole.BASE_COLOR, DemoAssetRole.NORMAL, DemoAssetRole.ROUGHNESS]));
        expect("IMAGE" in DemoResourceKind).toBe(false);
    });

    it("loads every checked-in JSON definition through the catalog lookup", () => {
        expect(DemoCatalogEntries).toHaveLength(DemoCatalogDemoCount);
        expect(DemoCatalogEntries.map(({ id }) => id)).toEqual(DemoCatalogRegistry.demos.map(({ id }) => id));
        expect(DemoCatalogEntries.every(({ graph, editor }) => graph !== undefined && editor.frames.length >= 0)).toBe(true);
        expect(GetDemoCatalogEntry("gltf-optimize-draco-basisu")).toBe(DemoCatalogEntries[0]);
        expect(GetDemoCatalogEntry("missing-demo")).toBeUndefined();
    });

    it("keeps selection parity, lanes, packed texture views, and catalog view models explicit", () => {
        expect(DemoCatalogRegistry.selectionParity).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ ownerRepresentation: "gltf", status: "supported" }),
                expect.objectContaining({ ownerRepresentation: "usd", status: "supported" }),
                expect.objectContaining({ ownerRepresentation: "babylon", status: "requires-adapter" }),
            ])
        );

        const materialDemo = DemoCatalogRegistry.demos.find(({ id }) => id === "multi-domain-material-construction")!;
        expect(materialDemo.availability.status).toBe("available");
        expect(materialDemo.resourceLanes.flatMap(({ textureBindingIds }) => textureBindingIds)).toEqual(expect.arrayContaining(["metallic-texture", "roughness-texture"]));
        expect(materialDemo.textureBindings).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    role: DemoAssetRole.METALLIC,
                    channelView: { channel: "b", colorSpace: "linear", packedGroupId: "metallic-roughness" },
                }),
                expect.objectContaining({
                    role: DemoAssetRole.ROUGHNESS,
                    channelView: { channel: "g", colorSpace: "linear", packedGroupId: "metallic-roughness" },
                }),
            ])
        );
        expect(materialDemo.materialTargets).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    domain: "materialx",
                    type: "gltf_pbr",
                    fidelity: "high-fidelity",
                    expectedLosses: [],
                }),
                expect.objectContaining({
                    domain: "usd",
                    type: "UsdPreviewSurface",
                    fidelity: "fallback",
                    expectedLosses: [expect.objectContaining({ feature: "MaterialX gltf_pbr fidelity", severity: "warning" })],
                }),
            ])
        );
        expect(materialDemo.expectedLosses).toEqual(
            expect.arrayContaining([expect.objectContaining({ id: "materialx-preview-surface-fallback", policy: "drop", severity: "warning" })])
        );
        expect(materialDemo.editor.lossBadges).toEqual(
            expect.arrayContaining([{ diagnosticId: "materialx-preview-surface-fallback", label: "UsdPreviewSurface fallback", severity: "warning", graphNodeIds: [5] }])
        );
        expect(materialDemo.preExportReview.accumulatedLosses).toEqual(expect.arrayContaining([expect.objectContaining({ id: "materialx-preview-surface-fallback" })]));

        const babylonDemo = DemoCatalogRegistry.demos.find(({ id }) => id === "babylon-mutation-to-gltf")!;
        expect(babylonDemo.availability).toEqual(expect.objectContaining({ status: "requires-selection-adapter" }));
        expect(babylonDemo.selections.every(({ pill }) => pill.ownerRepresentation === "babylon")).toBe(true);

        const viewModels = BuildDemoCatalogViewModels(DemoCatalogRegistry);
        expect(viewModels).toHaveLength(DemoCatalogDemoCount);
        expect(viewModels.map(({ id }) => id)).toEqual(DemoCatalogRegistry.demos.map(({ id }) => id));
        expect(viewModels[0].selectionPills).toEqual(DemoCatalogRegistry.demos[0].selections.map(({ pill }) => pill));
        expect(viewModels.find(({ id }) => id === materialDemo.id)?.textureBindings).toEqual(materialDemo.textureBindings);
        expect(viewModels.find(({ id }) => id === "usd-to-babylon-to-gltf")?.sceneDiagnostics).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    kind: "left-handed-scene",
                    representation: "babylon",
                    handedness: "left",
                    scope: "representation-lane",
                }),
                expect.objectContaining({
                    kind: "left-handed-scene",
                    representation: "babylon",
                    handedness: "left",
                    scope: "conversion",
                }),
            ])
        );
    });
});
