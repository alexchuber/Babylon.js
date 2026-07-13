import { describe, expect, it } from "vitest";

import {
    DemoCatalogSchemaVersion,
    DemoCatalogDemoCount,
    DemoCatalogRegistry,
    DemoAssetRole,
    DemoLossPolicy,
    DemoResourceKind,
    DemoTeachingConcept,
    DemoUsdFixtureFormat,
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
    demos: [
        {
            id: "usd-to-gltf",
            title: "USD to glTF",
            summary: "Transcode a USD scene to the glTF scene spine.",
            description: "Transcode a USD scene to the glTF scene spine.",
            tags: ["usd", "gltf", "transcoding"],
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
                },
            ],
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

        const evaluation = catalog.demos[0].graph[1];
        expect(IsEvaluateNodeGeometryNode(evaluation)).toBe(true);
        expect(evaluation.evaluation).toEqual({
            mode: "explicit",
            operation: "build",
        });
        const bake = catalog.demos[0].graph[2];
        expect(IsBakeNodeGeometryNode(bake)).toBe(true);
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
        }

        const usdDemo = DemoCatalogRegistry.demos.find(({ id }) => id === "usd-to-gltf")!;
        expect(usdDemo.resources[0]).toMatchObject({
            kind: DemoResourceKind.USD,
            format: DemoUsdFixtureFormat.USDZ,
            source: { kind: "bundled", origin: "same-origin", assetKey: "toycar-usdz" },
            resolvedStage: { representation: "IResolvedStage" },
        });

        const nodeGeometryDemo = DemoCatalogRegistry.demos.find(({ id }) => id === "node-geometry-box-to-gltf")!;
        const nodeGeometryGraph = nodeGeometryDemo.graph as readonly DemoGraphNode[];
        expect(nodeGeometryGraph.map(({ kind }) => kind)).toEqual(["ImportNodeGeometry", "EvaluateNodeGeometry", "BakeNodeGeometry", "ExportScene"]);
        expect(nodeGeometryDemo.nodeGeometry.status).toBe("requires-adapter");
        expect(nodeGeometryDemo.nodeGeometry.proceduralUntil).toBe("BakeNodeGeometry");

        const selectionStatuses = DemoCatalogRegistry.demos.flatMap((demo) => demo.selections.map(({ resolution }) => resolution.status));
        expect(selectionStatuses).toEqual(expect.arrayContaining(["resolved", "stale", "dangling", "empty"]));

        const imageRoles = DemoCatalogRegistry.demos.flatMap((demo) => demo.assets.filter(({ role }) => role !== DemoAssetRole.SOURCE_SCENE).map(({ role }) => role));
        expect(imageRoles).toEqual(expect.arrayContaining([DemoAssetRole.BASE_COLOR, DemoAssetRole.NORMAL, DemoAssetRole.ROUGHNESS]));
        expect("IMAGE" in DemoResourceKind).toBe(false);
    });
});
