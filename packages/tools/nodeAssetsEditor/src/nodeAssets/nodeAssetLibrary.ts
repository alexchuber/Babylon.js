/** The browser-storage subset used by the Node Assets library. */
export interface INodeAssetLibraryStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}

/** One graph shown in the Node Assets library. */
export interface INodeAssetLibraryEntry {
    readonly id: string;
    readonly name: string;
    readonly baseName: string;
    readonly version: number;
    readonly source: "built-in" | "user";
    readonly serializedGraph: string;
}

interface INodeAssetLibraryOptions {
    readonly builtInEntries: readonly INodeAssetLibraryEntry[];
    readonly storage: INodeAssetLibraryStorage;
}

interface IStoredNodeAssetLibrary {
    readonly schemaVersion: 1;
    readonly entries: readonly INodeAssetLibraryEntry[];
}

interface ISerializedNodeAssetEditorFile {
    readonly graph: {
        name: string;
        readonly [key: string]: unknown;
    };
    readonly [key: string]: unknown;
}

const NodeAssetLibraryStorageKey = "BabylonJS.NodeAssetsEditor.Library.v1";

function IsRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function IsSerializedNodeAssetEditorFile(value: unknown): value is ISerializedNodeAssetEditorFile {
    return IsRecord(value) && IsRecord(value.graph) && typeof value.graph.name === "string" && value.graph.name.trim().length > 0;
}

function IsUserLibraryEntry(value: unknown): value is INodeAssetLibraryEntry {
    if (
        !IsRecord(value) ||
        typeof value.id !== "string" ||
        value.id.length === 0 ||
        typeof value.name !== "string" ||
        value.name.length === 0 ||
        typeof value.baseName !== "string" ||
        value.baseName.length === 0 ||
        typeof value.version !== "number" ||
        !Number.isInteger(value.version) ||
        value.version <= 0 ||
        value.source !== "user" ||
        typeof value.serializedGraph !== "string"
    ) {
        return false;
    }

    try {
        const serializedGraph: unknown = JSON.parse(value.serializedGraph);
        return IsSerializedNodeAssetEditorFile(serializedGraph) && serializedGraph.graph.name === value.name;
    } catch {
        return false;
    }
}

function IsStoredNodeAssetLibrary(value: unknown): value is IStoredNodeAssetLibrary {
    return IsRecord(value) && value.schemaVersion === 1 && Array.isArray(value.entries) && value.entries.every(IsUserLibraryEntry);
}

function ParseEditorFile(serializedGraph: string): ISerializedNodeAssetEditorFile {
    let parsed: unknown;
    try {
        parsed = JSON.parse(serializedGraph);
    } catch (error) {
        throw new Error("The current NodeAsset graph has an invalid serialization.", { cause: error });
    }
    if (!IsSerializedNodeAssetEditorFile(parsed)) {
        throw new Error("The current NodeAsset graph has an invalid serialization.");
    }
    return parsed;
}

/** Combines bundled NodeAsset examples with user graphs persisted in browser storage. */
export class NodeAssetLibrary {
    private readonly _builtInEntries: readonly INodeAssetLibraryEntry[];
    private readonly _storage: INodeAssetLibraryStorage;

    public constructor(options: INodeAssetLibraryOptions) {
        this._builtInEntries = options.builtInEntries;
        this._storage = options.storage;
    }

    /**
     * Lists bundled examples first, followed by user-saved graphs.
     * @returns All currently available Library entries.
     */
    public getEntries(): readonly INodeAssetLibraryEntry[] {
        return [...this.getBuiltInEntries(), ...this.getUserEntries()];
    }

    /**
     * Lists the source-controlled examples that remain available independently of browser storage.
     * @returns The bundled Library entries.
     */
    public getBuiltInEntries(): readonly INodeAssetLibraryEntry[] {
        return [...this._builtInEntries];
    }

    /**
     * Lists graphs the user saved in browser storage.
     * @returns The user-created Library entries.
     */
    public getUserEntries(): readonly INodeAssetLibraryEntry[] {
        return this._readUserEntries();
    }

    /**
     * Persists a copy of the current graph.
     * @param serializedGraph - The Node Assets Editor save-file JSON.
     * @param lineageBaseName - The original name of a Library entry being versioned.
     * @returns The newly saved library entry.
     */
    public save(serializedGraph: string, lineageBaseName?: string): INodeAssetLibraryEntry {
        const editorFile = ParseEditorFile(serializedGraph);
        const userEntries = this._readUserEntries();
        const entries = [...this._builtInEntries, ...userEntries];
        const baseName = lineageBaseName ?? editorFile.graph.name;
        const existingNames = new Set(entries.map((entry) => entry.name));
        let version = 1;
        let name = baseName;
        if (lineageBaseName !== undefined || existingNames.has(name)) {
            const existingVersions = entries.filter((entry) => entry.baseName === baseName).map((entry) => entry.version);
            version = Math.max(2, ...existingVersions.map((existingVersion) => existingVersion + 1));
            name = `${baseName} ${version}`;
            while (existingNames.has(name)) {
                version++;
                name = `${baseName} ${version}`;
            }
        }
        editorFile.graph.name = name;

        const entry: INodeAssetLibraryEntry = {
            id: `user:${name}`,
            name,
            baseName,
            version,
            source: "user",
            serializedGraph: JSON.stringify(editorFile, null, 2),
        };
        const updatedUserEntries = [...userEntries, entry];
        try {
            this._storage.setItem(NodeAssetLibraryStorageKey, JSON.stringify({ schemaVersion: 1, entries: updatedUserEntries } satisfies IStoredNodeAssetLibrary));
        } catch (error) {
            throw new Error("Could not save the graph to the Node Assets library.", { cause: error });
        }
        return entry;
    }

    private _readUserEntries(): readonly INodeAssetLibraryEntry[] {
        const stored = this._storage.getItem(NodeAssetLibraryStorageKey);
        if (stored === null) {
            return [];
        }
        let parsed: unknown;
        try {
            parsed = JSON.parse(stored);
        } catch (error) {
            throw new Error("Saved Node Assets library data is invalid.", { cause: error });
        }
        if (!IsStoredNodeAssetLibrary(parsed)) {
            throw new Error("Saved Node Assets library data is invalid.");
        }
        return parsed.entries;
    }
}
