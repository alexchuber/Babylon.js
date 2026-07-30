import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NullEngine } from "core/Engines/nullEngine";
import { Scene } from "core/scene";
import { Logger } from "core/Misc/logger";
import { ImportMeshAsync } from "core/Loading/sceneLoader";
import "loaders/USD/usdFileLoader";

import { ResolveUsdStageAsync } from "loaders/USD/resolution/usdResolver";

import { readRuntimeCorpusText, RoomAsset } from "./runtimeCorpus";

function importRoomAsync(scene: Scene) {
    return ImportMeshAsync(`data:${readRuntimeCorpusText(RoomAsset.fileName)}`, scene, {
        pluginExtension: ".usda",
        name: RoomAsset.fileName,
    });
}

function resolveRoom() {
    return ResolveUsdStageAsync(readRuntimeCorpusText(RoomAsset.fileName), "", RoomAsset.fileName, {});
}

const ROOM_PARTS = ["Floor", "BackWall", "LeftWall", "RightWall", "FrontWallLeft", "FrontWallRight"] as const;

describe("USD runtime corpus - Room", () => {
    let engine: NullEngine;
    let scene: Scene;

    beforeEach(() => {
        engine = new NullEngine();
        scene = new Scene(engine);
    });

    afterEach(() => {
        scene.dispose();
        engine.dispose();
    });

    // -- Hierarchy --

    it("loads through ImportMeshAsync with the expected Room hierarchy", async () => {
        const result = await importRoomAsync(scene);

        const roomNode = result.transformNodes.find((n) => n.name === "Room");
        expect(roomNode).toBeDefined();

        for (const partName of ROOM_PARTS) {
            const partNode = result.transformNodes.find((n) => n.name === partName);
            expect(partNode, `expected transform node '${partName}'`).toBeDefined();
            expect(partNode!.parent?.name).toBe("Room");
        }
    });

    it("produces exactly 6 renderable Cube meshes all named geom", async () => {
        const result = await importRoomAsync(scene);

        const renderableMeshes = result.meshes.filter((m) => m.getTotalVertices() > 0);
        expect(renderableMeshes).toHaveLength(6);

        for (const mesh of renderableMeshes) {
            expect(mesh.name).toBe("geom");
            expect(mesh.getTotalVertices()).toBe(24);
            expect(mesh.getTotalIndices()).toBe(36);
        }
    });

    it("parents each geom mesh under its corresponding room part", async () => {
        const result = await importRoomAsync(scene);

        const renderableMeshes = result.meshes.filter((m) => m.getTotalVertices() > 0);
        const parentNames = new Set(renderableMeshes.map((m) => m.parent?.name));
        for (const partName of ROOM_PARTS) {
            expect(parentNames.has(partName), `geom should be parented under '${partName}'`).toBe(true);
        }
    });

    // -- Door gap --

    it("models the front wall as two segments with a centered 3-unit door gap", async () => {
        const stage = await resolveRoom();

        const roomPrim = stage.root.children[0];
        expect(roomPrim.name).toBe("Room");

        const frontLeft = roomPrim.children.find((c) => c.name === "FrontWallLeft");
        const frontRight = roomPrim.children.find((c) => c.name === "FrontWallRight");
        expect(frontLeft).toBeDefined();
        expect(frontRight).toBeDefined();

        // FrontWallLeft: translate (-4.5, 3, 7.5), scale (6, 6, 0.25)
        expect(frontLeft!.transform.translation[0]).toBeCloseTo(-4.5);
        expect(frontLeft!.transform.scale[0]).toBeCloseTo(6);

        // FrontWallRight: translate (4.5, 3, 7.5), scale (6, 6, 0.25)
        expect(frontRight!.transform.translation[0]).toBeCloseTo(4.5);
        expect(frontRight!.transform.scale[0]).toBeCloseTo(6);

        // Gap: from x = -4.5 + 6/2 = -1.5 to x = 4.5 - 6/2 = 1.5 → width 3
        // The inner edges of the two segments define the door gap width.
        // FrontWallLeft occupies from x = -4.5 - 3 = -7.5 to x = -4.5 + 3 = -1.5
        // FrontWallRight occupies from x = 4.5 - 3 = 1.5 to x = 4.5 + 3 = 7.5
        // Gap is 3 units wide (from -1.5 to 1.5).
        const leftInnerEdge = frontLeft!.transform.translation[0] + frontLeft!.transform.scale[0] / 2;
        const rightInnerEdge = frontRight!.transform.translation[0] - frontRight!.transform.scale[0] / 2;
        const gapWidth = rightInnerEdge - leftInnerEdge;
        expect(gapWidth).toBeCloseTo(3.0);
    });

    // -- Transforms --

    it("resolves authored transforms on all six room parts", async () => {
        const stage = await resolveRoom();
        const roomPrim = stage.root.children[0];

        const expected: Record<string, { translate: [number, number, number]; scale: [number, number, number] }> = {
            Floor: { translate: [0, 0.05, 0], scale: [15, 0.1, 15] },
            BackWall: { translate: [0, 3, -7.5], scale: [15, 6, 0.25] },
            LeftWall: { translate: [-7.5, 3, 0], scale: [0.25, 6, 15] },
            RightWall: { translate: [7.5, 3, 0], scale: [0.25, 6, 15] },
            FrontWallLeft: { translate: [-4.5, 3, 7.5], scale: [6, 6, 0.25] },
            FrontWallRight: { translate: [4.5, 3, 7.5], scale: [6, 6, 0.25] },
        };

        for (const [partName, exp] of Object.entries(expected)) {
            const part = roomPrim.children.find((c) => c.name === partName);
            expect(part, `expected prim '${partName}'`).toBeDefined();

            for (let i = 0; i < 3; i++) {
                expect(part!.transform.translation[i]).toBeCloseTo(exp.translate[i], 2);
                expect(part!.transform.scale[i]).toBeCloseTo(exp.scale[i], 2);
            }
        }
    });

    // -- Display colors and opacity --

    it("resolves Floor display color (0.72, 0.74, 0.78) with 50% opacity", async () => {
        const stage = await resolveRoom();

        const roomPrim = stage.root.children[0];
        const floorPart = roomPrim.children.find((c) => c.name === "Floor");
        const geomPrim = floorPart?.children.find((c) => c.kind === "mesh");
        expect(geomPrim).toBeDefined();

        const mesh = stage.meshes[geomPrim!.meshIndex!];
        expect(mesh.colors).toBeDefined();
        expect(mesh.colors![0]).toBeCloseTo(0.72);
        expect(mesh.colors![1]).toBeCloseTo(0.74);
        expect(mesh.colors![2]).toBeCloseTo(0.78);
        expect(mesh.colors![3]).toBeCloseTo(0.5);
    });

    it("resolves wall display color (0.75, 0.77, 0.81) with 50% opacity on all wall parts", async () => {
        const stage = await resolveRoom();

        const roomPrim = stage.root.children[0];
        const wallNames = ["BackWall", "LeftWall", "RightWall", "FrontWallLeft", "FrontWallRight"];

        for (const wallName of wallNames) {
            const wallPart = roomPrim.children.find((c) => c.name === wallName);
            const geomPrim = wallPart?.children.find((c) => c.kind === "mesh");
            expect(geomPrim, `expected mesh prim under '${wallName}'`).toBeDefined();

            const mesh = stage.meshes[geomPrim!.meshIndex!];
            expect(mesh.colors).toBeDefined();
            expect(mesh.colors![0]).toBeCloseTo(0.75);
            expect(mesh.colors![1]).toBeCloseTo(0.77);
            expect(mesh.colors![2]).toBeCloseTo(0.81);
            expect(mesh.colors![3]).toBeCloseTo(0.5);
        }
    });

    // -- Authored dimensions and bounds --

    it("produces a 15×6 footprint with wall height 6 at the resolution layer", async () => {
        const stage = await resolveRoom();

        const roomPrim = stage.root.children[0];

        // Floor: scale (15, 0.1, 15) → 15×15 footprint
        const floor = roomPrim.children.find((c) => c.name === "Floor");
        expect(floor!.transform.scale[0]).toBeCloseTo(15);
        expect(floor!.transform.scale[2]).toBeCloseTo(15);

        // Walls: scale y = 6 → wall height 6
        const backWall = roomPrim.children.find((c) => c.name === "BackWall");
        expect(backWall!.transform.scale[1]).toBeCloseTo(6);
    });

    it("does not emit unsupported-Cube diagnostics for valid Room Cube input", async () => {
        const log = vi.spyOn(Logger, "Log").mockImplementation(() => {});
        const warn = vi.spyOn(Logger, "Warn").mockImplementation(() => {});
        try {
            await importRoomAsync(scene);

            const allMessages = [...log.mock.calls.map((c) => String(c[0])), ...warn.mock.calls.map((c) => String(c[0]))];
            expect(allMessages.some((msg) => /Cube prims are not supported/i.test(msg))).toBe(false);
        } finally {
            log.mockRestore();
            warn.mockRestore();
        }
    });

    // -- Cube reuse (no fixture-specific geometry code) --

    it("uses subdivisionScheme 'none' on all resolved Cube meshes", async () => {
        const stage = await resolveRoom();

        for (const mesh of stage.meshes) {
            expect(mesh.subdivisionScheme).toBe("none");
        }
    });

    it("produces 24 vertices and 36 indices per Cube mesh (shared Cube geometry)", async () => {
        const stage = await resolveRoom();

        for (const mesh of stage.meshes) {
            expect(mesh.positions.length).toBe(24 * 3);
            expect(mesh.indices.length).toBe(36);
            expect(mesh.normals).toBeDefined();
            expect(mesh.normals!.length).toBe(24 * 3);
        }
    });
});
