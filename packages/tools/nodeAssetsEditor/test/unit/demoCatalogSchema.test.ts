import { describe, expect, it } from "vitest";

import {
    DemoCatalogSchemaVersion,
    DemoLossPolicy,
    DemoResourceKind,
    IsNodeGeometryResource,
    type DemoCatalog,
    type DemoNodeGeometryResource,
} from "../../src/nodeAssets/demoCatalogSchema";

const nodeGeometryResource: DemoNodeGeometryResource = {
    id: "geometry",
    label: "Generated geometry",
    kind: DemoResourceKind.NODE_GEOMETRY,
    source: { kind: "snippet", snippetId: "PYY6XE#69" },
    evaluation: {
        required: true,
        mode: "explicit",
        operation: "build",
    },
};

const catalog: DemoCatalog = {
    version: DemoCatalogSchemaVersion,
    demos: [
        {
            id: "usd-to-gltf",
            title: "USD to glTF",
            description: "Transcode a USD scene to the glTF scene spine.",
            tags: ["usd", "gltf", "transcoding"],
            resources: [
                {
                    id: "source",
                    label: "Source scene",
                    kind: DemoResourceKind.USD,
                    source: { kind: "url", url: "https://example.test/source.usd" },
                    domainTags: {
                        handedness: "right",
                        unit: "meters",
                        upAxis: "y",
                    },
                },
                nodeGeometryResource,
            ],
            expectedLosses: [
                {
                    feature: "USD variants",
                    policy: DemoLossPolicy.DROP,
                    severity: "warning",
                    why: "The glTF scene spine has no equivalent variant-set model.",
                },
                {
                    feature: "Custom material metadata",
                    policy: DemoLossPolicy.EXTENSION,
                    extension: "EXT_demo_metadata",
                    severity: "info",
                    why: "The metadata is carried in a target extension.",
                },
            ],
            domainTags: {
                handedness: "right",
                unit: "meters",
                upAxis: "y",
            },
        },
    ],
};

describe("demo catalog schema", () => {
    it("supports structured expected-loss diagnostics and domain tags", () => {
        const demo = catalog.demos[0];

        expect(demo.expectedLosses).toHaveLength(2);
        expect(demo.expectedLosses[0]).toMatchObject({
            policy: "drop",
            severity: "warning",
        });
        expect(demo.domainTags).toEqual({
            handedness: "right",
            unit: "meters",
            upAxis: "y",
        });
    });

    it("marks NodeGeometry resources for explicit build evaluation", () => {
        expect(IsNodeGeometryResource(nodeGeometryResource)).toBe(true);
        expect(nodeGeometryResource.evaluation).toEqual({
            required: true,
            mode: "explicit",
            operation: "build",
        });
    });
});
