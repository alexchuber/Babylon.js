import type { IKnowledgeChunk, KnowledgeType } from "../types.js";
import { IngestorBase } from "./IngestorBase.js";

/**
 * Mock Typedoc JSON structure for proving the pipeline works.
 * In a real implementation, this would read the typedoc JSON output
 * from the monorepo build.
 */
interface ITypedocEntry {
    /** Entry name. */
    name: string;
    /** Kind of API entity. */
    kind: "class" | "method" | "property" | "interface" | "enum";
    /** TypeScript signature. */
    signature?: string;
    /** Documentation comment. */
    comment?: string;
    /** Parent class/interface name. */
    parent?: string;
    /** Child entries. */
    children?: ITypedocEntry[];
}

/**
 * Configuration for the Typedoc ingestor.
 */
export interface ITypedocIngestorConfig {
    /** Path to typedoc JSON file. If not provided, uses built-in mock data. */
    jsonPath?: string;
}

/**
 * Reads Typedoc JSON output and produces API-type IKnowledgeChunks.
 * Falls back to mock data if no JSON file is available.
 */
export class TypedocIngestor extends IngestorBase {
    /** {@inheritDoc} */
    public readonly sourceType: KnowledgeType = "api";

    private _config: ITypedocIngestorConfig;

    /** @param config - Optional ingestor configuration. */
    constructor(config?: ITypedocIngestorConfig) {
        super();
        this._config = config || {};
    }

    /**
     * Read Typedoc JSON and produce API-type knowledge chunks.
     * @returns Array of API-type knowledge chunks.
     */
    public async ingestAsync(): Promise<IKnowledgeChunk[]> {
        let entries: ITypedocEntry[];

        if (this._config.jsonPath) {
            this._log(`Reading typedoc JSON from: ${this._config.jsonPath}`);
            try {
                const fs = await import("fs");
                const raw = fs.readFileSync(this._config.jsonPath, "utf-8");
                entries = JSON.parse(raw) as ITypedocEntry[];
            } catch (err) {
                this._warn(`Failed to read typedoc JSON: ${err instanceof Error ? err.message : String(err)}`);
                this._log("Falling back to mock data.");
                entries = this._getMockEntries();
            }
        } else {
            this._log("No typedoc JSON path configured. Using mock API data.");
            entries = this._getMockEntries();
        }

        const chunks: IKnowledgeChunk[] = [];
        this._processEntries(entries, chunks);

        this._log(`Ingested ${chunks.length} API chunks.`);
        return chunks;
    }

    private _processEntries(entries: ITypedocEntry[], chunks: IKnowledgeChunk[], parentName?: string): void {
        for (const entry of entries) {
            const fullName = parentName ? `${parentName}.${entry.name}` : entry.name;
            const chunkId = `api:${fullName}`;
            const childIds: string[] = [];

            if (entry.children) {
                for (const child of entry.children) {
                    childIds.push(`api:${fullName}.${child.name}`);
                }
            }

            chunks.push({
                id: chunkId,
                content: entry.comment || `${entry.kind}: ${fullName}${entry.signature ? ` — ${entry.signature}` : ""}`,
                type: "api",
                metadata: {
                    sourceUrl: `https://doc.babylonjs.com/typedoc/classes/${(parentName || entry.name).toUpperCase()}`,
                    title: fullName,
                    apiSignature: entry.signature || fullName,
                    parentContext: parentName,
                },
                linkIds: childIds.length > 0 ? childIds : undefined,
            });

            if (entry.children) {
                this._processEntries(entry.children, chunks, fullName);
            }
        }
    }

    private _getMockEntries(): ITypedocEntry[] {
        return [
            {
                name: "Vector3",
                kind: "class",
                comment: "Represents a 3D vector with x, y, and z components. Used extensively for positions, directions, and scaling in 3D space.",
                signature: "new Vector3(x?: number, y?: number, z?: number)",
                children: [
                    { name: "x", kind: "property", comment: "The x component of the vector.", signature: "x: number" },
                    { name: "y", kind: "property", comment: "The y component of the vector.", signature: "y: number" },
                    { name: "z", kind: "property", comment: "The z component of the vector.", signature: "z: number" },
                    {
                        name: "add",
                        kind: "method",
                        comment: "Adds the given vector to the current vector and returns a new Vector3.",
                        signature: "add(otherVector: Vector3): Vector3",
                    },
                    {
                        name: "subtract",
                        kind: "method",
                        comment: "Subtracts the given vector from the current vector and returns a new Vector3.",
                        signature: "subtract(otherVector: Vector3): Vector3",
                    },
                    { name: "length", kind: "method", comment: "Returns the length (magnitude) of the vector.", signature: "length(): number" },
                    {
                        name: "normalize",
                        kind: "method",
                        comment: "Normalizes the vector in place (makes it unit length) and returns the updated vector.",
                        signature: "normalize(): Vector3",
                    },
                    {
                        name: "constructor",
                        kind: "method",
                        comment: "Creates a new Vector3 with the given x, y, z values.",
                        signature: "constructor(x?: number, y?: number, z?: number)",
                    },
                ],
            },
            {
                name: "PhysicsImpostor",
                kind: "class",
                comment:
                    "A physics impostor is used to simulate physics on a mesh. It wraps the physics engine body and provides methods for applying forces, impulses, and setting physical properties.",
                signature: "new PhysicsImpostor(object: IPhysicsEnabledObject, type: number, options?: PhysicsImpostorParameters, scene?: Scene)",
                children: [
                    {
                        name: "applyImpulse",
                        kind: "method",
                        comment: "Applies an impulse (instantaneous force) to the physics body at a specific contact point. An impulse changes the velocity immediately.",
                        signature: "applyImpulse(force: Vector3, contactPoint: Vector3): PhysicsImpostor",
                    },
                    {
                        name: "applyForce",
                        kind: "method",
                        comment: "Applies a force to the physics body at a specific contact point. Forces are accumulated over the physics time step.",
                        signature: "applyForce(force: Vector3, contactPoint: Vector3): PhysicsImpostor",
                    },
                    {
                        name: "setLinearVelocity",
                        kind: "method",
                        comment: "Sets the linear velocity of the physics body.",
                        signature: "setLinearVelocity(velocity: Vector3): void",
                    },
                    {
                        name: "setAngularVelocity",
                        kind: "method",
                        comment: "Sets the angular velocity (rotation speed) of the physics body.",
                        signature: "setAngularVelocity(velocity: Vector3): void",
                    },
                    {
                        name: "mass",
                        kind: "property",
                        comment: "Gets or sets the mass of the physics impostor. A mass of 0 makes the object static (immovable).",
                        signature: "mass: number",
                    },
                    {
                        name: "restitution",
                        kind: "property",
                        comment: "Gets or sets the restitution (bounciness) of the physics impostor. Value between 0 (no bounce) and 1 (perfect bounce).",
                        signature: "restitution: number",
                    },
                    {
                        name: "friction",
                        kind: "property",
                        comment: "Gets or sets the friction coefficient of the physics impostor.",
                        signature: "friction: number",
                    },
                ],
            },
            {
                name: "ArcRotateCamera",
                kind: "class",
                comment:
                    "A camera that rotates around a target point. It can be controlled with cursor keys and mouse, or touch events. This is the most commonly used camera for 3D scenes.",
                signature: "new ArcRotateCamera(name: string, alpha: number, beta: number, radius: number, target: Vector3, scene?: Scene)",
                children: [
                    { name: "alpha", kind: "property", comment: "The longitudinal rotation angle in radians.", signature: "alpha: number" },
                    { name: "beta", kind: "property", comment: "The latitudinal rotation angle in radians.", signature: "beta: number" },
                    { name: "radius", kind: "property", comment: "The distance from the target.", signature: "radius: number" },
                    {
                        name: "setTarget",
                        kind: "method",
                        comment: "Sets the target position that the camera orbits around.",
                        signature: "setTarget(target: Vector3): void",
                    },
                    {
                        name: "attachControl",
                        kind: "method",
                        comment: "Attaches the camera controls (mouse, touch, keyboard) to the canvas.",
                        signature: "attachControl(element: HTMLElement, noPreventDefault?: boolean): void",
                    },
                ],
            },
            {
                name: "FreeCamera",
                kind: "class",
                comment:
                    "A free camera that can move freely in the scene. Controlled via cursor keys or WASD for movement and mouse for looking around. Commonly used for first-person perspectives.",
                signature: "new FreeCamera(name: string, position: Vector3, scene?: Scene)",
                children: [
                    {
                        name: "speed",
                        kind: "property",
                        comment: "The speed of movement of the camera in scene units per second.",
                        signature: "speed: number",
                    },
                    {
                        name: "keysUp",
                        kind: "property",
                        comment: "Array of key codes that trigger forward movement.",
                        signature: "keysUp: number[]",
                    },
                ],
            },
            {
                name: "Scene",
                kind: "class",
                comment: "The Scene class represents the entire 3D scene. It holds all meshes, lights, cameras, materials, and other entities.",
                signature: "new Scene(engine: Engine, options?: SceneOptions)",
                children: [
                    {
                        name: "enablePhysics",
                        kind: "method",
                        comment: "Enables physics simulation in the scene with a given gravity and physics engine plugin (e.g., Havok, Cannon, Ammo, Oimo).",
                        signature: "enablePhysics(gravity?: Vector3, plugin?: IPhysicsEnginePlugin): boolean",
                    },
                    {
                        name: "meshes",
                        kind: "property",
                        comment: "Array of all meshes in the scene.",
                        signature: "meshes: AbstractMesh[]",
                    },
                    {
                        name: "activeCamera",
                        kind: "property",
                        comment: "The active camera used for rendering.",
                        signature: "activeCamera: Nullable<Camera>",
                    },
                ],
            },
        ];
    }
}
