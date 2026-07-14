import { describe, expect, it } from "vitest";

import { NodeAssetLibrary, type INodeAssetLibraryEntry, type INodeAssetLibraryStorage } from "../../src/nodeAssets/nodeAssetLibrary";

class MemoryStorage implements INodeAssetLibraryStorage {
    public failWrites = false;
    private _value: string | null;

    public constructor(initialValue: string | null = null) {
        this._value = initialValue;
    }

    public getItem(): string | null {
        return this._value;
    }

    public setItem(_key: string, value: string): void {
        if (this.failWrites) {
            throw new Error("quota exceeded");
        }
        this._value = value;
    }
}

function CreateSerializedGraph(name: string): string {
    return JSON.stringify({
        graph: { name, blocks: [], connections: [] },
        editor: { blocks: [] },
    });
}

function CreateBuiltInEntry(name: string): INodeAssetLibraryEntry {
    return {
        id: `built-in:${name}`,
        name,
        baseName: name,
        version: 1,
        source: "built-in",
        serializedGraph: CreateSerializedGraph(name),
    };
}

describe("NodeAssetLibrary", () => {
    it("saves the current graph and lists it after the bundled samples", () => {
        const library = new NodeAssetLibrary({
            builtInEntries: [CreateBuiltInEntry("Bundled Sample")],
            storage: new MemoryStorage(),
        });

        const saved = library.save(CreateSerializedGraph("My Graph"));

        expect(saved).toMatchObject({
            id: "user:My Graph",
            name: "My Graph",
            baseName: "My Graph",
            version: 1,
            source: "user",
        });
        expect(JSON.parse(saved.serializedGraph).graph.name).toBe("My Graph");
        expect(library.getEntries().map((entry) => entry.name)).toEqual(["Bundled Sample", "My Graph"]);
    });

    it("adds an incrementing version number when the graph name already exists", () => {
        const library = new NodeAssetLibrary({
            builtInEntries: [],
            storage: new MemoryStorage(),
        });

        library.save(CreateSerializedGraph("My Graph"));
        const second = library.save(CreateSerializedGraph("My Graph"));
        const third = library.save(CreateSerializedGraph("My Graph"));

        expect([second.name, third.name]).toEqual(["My Graph 2", "My Graph 3"]);
        expect([second.version, third.version]).toEqual([2, 3]);
        expect(JSON.parse(third.serializedGraph).graph.name).toBe("My Graph 3");
    });

    it("continues a bundled or saved entry's version lineage", () => {
        const library = new NodeAssetLibrary({
            builtInEntries: [CreateBuiltInEntry("Bundled Sample")],
            storage: new MemoryStorage(),
        });

        const second = library.save(CreateSerializedGraph("Bundled Sample"), "Bundled Sample");
        const third = library.save(second.serializedGraph, second.baseName);

        expect([second.name, third.name]).toEqual(["Bundled Sample 2", "Bundled Sample 3"]);
        expect([second.version, third.version]).toEqual([2, 3]);
    });

    it("keeps bundled samples available when saved library data is invalid", () => {
        const library = new NodeAssetLibrary({
            builtInEntries: [CreateBuiltInEntry("Bundled Sample")],
            storage: new MemoryStorage(JSON.stringify({ schemaVersion: 1, entries: [{ name: 42 }] })),
        });

        expect(library.getBuiltInEntries().map((entry) => entry.name)).toEqual(["Bundled Sample"]);
        expect(() => library.getUserEntries()).toThrow("Saved Node Assets library data is invalid.");
    });

    it("rejects an empty saved library payload instead of treating it as an empty library", () => {
        const library = new NodeAssetLibrary({
            builtInEntries: [CreateBuiltInEntry("Bundled Sample")],
            storage: new MemoryStorage(""),
        });

        expect(library.getBuiltInEntries().map((entry) => entry.name)).toEqual(["Bundled Sample"]);
        expect(() => library.getUserEntries()).toThrow("Saved Node Assets library data is invalid.");
    });

    it("rejects a saved entry whose graph serialization does not match its name", () => {
        const storedEntry = {
            id: "user:Broken Graph",
            name: "Broken Graph",
            baseName: "Broken Graph",
            version: 1,
            source: "user",
            serializedGraph: CreateSerializedGraph("Different Graph"),
        };
        const library = new NodeAssetLibrary({
            builtInEntries: [],
            storage: new MemoryStorage(JSON.stringify({ schemaVersion: 1, entries: [storedEntry] })),
        });

        expect(() => library.getUserEntries()).toThrow("Saved Node Assets library data is invalid.");
    });

    it("reports a failed browser-storage write without replacing existing entries", () => {
        const storage = new MemoryStorage();
        const library = new NodeAssetLibrary({ builtInEntries: [], storage });
        library.save(CreateSerializedGraph("Existing Graph"));
        storage.failWrites = true;

        expect(() => library.save(CreateSerializedGraph("New Graph"))).toThrow("Could not save the graph to the Node Assets library.");
        expect(library.getUserEntries().map((entry) => entry.name)).toEqual(["Existing Graph"]);
    });

    it("rejects an invalid current graph without writing a library entry", () => {
        const library = new NodeAssetLibrary({
            builtInEntries: [],
            storage: new MemoryStorage(),
        });

        expect(() => library.save("{}")).toThrow("The current NodeAsset graph has an invalid serialization.");
        expect(library.getUserEntries()).toEqual([]);
    });
});
