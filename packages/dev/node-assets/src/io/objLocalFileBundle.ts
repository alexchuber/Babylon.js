import { FilesInputStore } from "core/Misc/filesInputStore";

import { type IOBJSourceFile, type OBJSourceAsset, _NormalizeOBJSourcePath } from "../representations/objSourceAsset";

/** Dependencies used by the scoped local OBJ bundle. */
// eslint-disable-next-line @typescript-eslint/naming-convention
export interface IOBJLocalFileBundleDependencies {
    /** File store receiving scoped loader aliases. */
    readonly store: Record<string, File>;
    /**
     * Creates a loader-compatible File.
     * @param file The persisted companion.
     */
    createFile(file: IOBJSourceFile): File;
}

/** Build-local registration of OBJ companion files. */
// eslint-disable-next-line @typescript-eslint/naming-convention
export interface IOBJLocalFileBundleLease {
    /** Collision-safe root passed to Babylon's OBJ loader. */
    readonly rootUrl: string;
    /** Whether this lease has already released its entries. */
    readonly isDisposed: boolean;
    /** Releases only entries still owned by this lease. */
    dispose(): void;
}

let NextBundleId = 0;
const TextDecoderInstance = new TextDecoder();

function GetDirectory(path: string): string {
    const separator = path.lastIndexOf("/");
    return separator === -1 ? "" : path.slice(0, separator + 1);
}

function GetRelativePath(fromDirectory: string, toPath: string): string {
    const fromSegments = fromDirectory.split("/").filter(Boolean);
    const toSegments = toPath.split("/");
    let sharedSegments = 0;
    while (sharedSegments < fromSegments.length && sharedSegments < toSegments.length - 1 && fromSegments[sharedSegments] === toSegments[sharedSegments]) {
        sharedSegments++;
    }
    return [...fromSegments.slice(sharedSegments).map(() => ".."), ...toSegments.slice(sharedSegments)].join("/");
}

function GetFileName(path: string): string {
    return path.slice(path.lastIndexOf("/") + 1);
}

function GetLastMaterialLibraryReference(bytes: Uint8Array): string | undefined {
    const source = TextDecoderInstance.decode(bytes).replace(/#.*$/gm, "").trim();
    let reference: string | undefined;
    for (const sourceLine of source.split("\n")) {
        const line = sourceLine.trim().replace(/\s\s/g, " ");
        if (line.startsWith("mtllib ")) {
            reference = line.substring(7).trim();
        }
    }
    return reference;
}

function GetTextureReferences(bytes: Uint8Array): string[] {
    const references: string[] = [];
    let hasMaterial = false;
    for (const sourceLine of TextDecoderInstance.decode(bytes).split("\n")) {
        const line = sourceLine.trim();
        if (line.length === 0 || line.startsWith("#")) {
            continue;
        }
        const separator = line.indexOf(" ");
        const key = (separator === -1 ? line : line.substring(0, separator)).toLowerCase();
        let value = separator === -1 ? "" : line.substring(separator + 1).trim();
        if (key === "newmtl") {
            hasMaterial = true;
            continue;
        }
        if (!hasMaterial || (key !== "map_ka" && key !== "map_kd" && key !== "map_ks" && key !== "map_bump" && key !== "map_d")) {
            continue;
        }
        if (key === "map_bump") {
            const values = value.split(/\s+/);
            const bumpMultiplierIndex = values.indexOf("-bm");
            if (bumpMultiplierIndex !== -1) {
                values.splice(bumpMultiplierIndex, 2);
                value = values.join(" ");
            }
        }
        if (value) {
            references.push(value);
        }
    }
    return references;
}

function HasStorePrefix(store: Record<string, File>, prefix: string): boolean {
    return Object.keys(store).some((key) => key.startsWith(prefix));
}

function CreateDefaultFile(file: IOBJSourceFile): File {
    const extension = file.path.slice(file.path.lastIndexOf(".") + 1).toLowerCase();
    const mimeType =
        extension === "png"
            ? "image/png"
            : extension === "jpg" || extension === "jpeg"
              ? "image/jpeg"
              : extension === "webp"
                ? "image/webp"
                : extension === "avif"
                  ? "image/avif"
                  : extension === "ktx2"
                    ? "image/ktx2"
                    : "text/plain";
    return new File([file.bytes.slice().buffer], GetFileName(file.path), { type: mimeType });
}

/**
 * Registers one uploaded OBJ bundle under a collision-safe virtual file root.
 * @param source The immutable uploaded OBJ source.
 * @param dependencies Optional local store adapter.
 * @returns The disposable scoped registration.
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export function AcquireOBJLocalFileBundle(
    source: OBJSourceAsset,
    dependencies: IOBJLocalFileBundleDependencies = {
        store: FilesInputStore.FilesToLoad,
        createFile: CreateDefaultFile,
    }
): IOBJLocalFileBundleLease {
    if (source.sourceKind !== "upload") {
        throw new TypeError("A local OBJ file bundle can only prepare uploaded sources.");
    }

    let prefix: string;
    do {
        prefix = `node-assets-obj-${++NextBundleId}/`;
    } while (HasStorePrefix(dependencies.store, prefix));

    const primary = source.primary;
    const primaryPath = _NormalizeOBJSourcePath(primary.path);
    const primaryDirectory = GetDirectory(primaryPath);
    const rootKey = `${prefix}${primaryDirectory}`;
    const aliases = new Map<string, IOBJSourceFile>();
    const companionsByBaseName = new Map<string, IOBJSourceFile>();

    const addAlias = (key: string, file: IOBJSourceFile) => {
        const existing = aliases.get(key);
        if (existing && existing.path !== file.path) {
            throw new TypeError(`The local OBJ file alias "${key}" is ambiguous.`);
        }
        aliases.set(key, file);
    };

    for (const companion of source.companions) {
        const normalizedPath = _NormalizeOBJSourcePath(companion.path);
        const relativePath = GetRelativePath(primaryDirectory, normalizedPath);
        companionsByBaseName.set(GetFileName(normalizedPath), companion);
        addAlias(`${prefix}${normalizedPath}`, companion);
        addAlias(`${rootKey}${relativePath}`, companion);
        addAlias(`${rootKey}${GetFileName(normalizedPath)}`, companion);
    }

    const addReferenceAlias = (reference: string): IOBJSourceFile | undefined => {
        const slashReference = reference.replaceAll("\\", "/");
        if (slashReference.startsWith("/") || /^[a-z]:/i.test(slashReference) || /^[a-z][a-z\d+.-]*:/i.test(slashReference)) {
            return undefined;
        }
        let normalizedReference: string;
        try {
            normalizedReference = _NormalizeOBJSourcePath(`${primaryDirectory}${slashReference}`);
        } catch (error) {
            if (error instanceof TypeError) {
                return undefined;
            }
            throw error;
        }
        const companion = companionsByBaseName.get(GetFileName(normalizedReference));
        if (!companion) {
            return undefined;
        }
        let key: string;
        try {
            key = decodeURIComponent(`${rootKey}${reference}`.toLowerCase());
        } catch (error) {
            if (error instanceof URIError) {
                return undefined;
            }
            throw error;
        }
        addAlias(key, companion);
        return companion;
    };

    const materialReference = GetLastMaterialLibraryReference(primary.bytes);
    const materialFile = materialReference ? addReferenceAlias(materialReference) : undefined;
    if (materialFile && _NormalizeOBJSourcePath(materialFile.path).endsWith(".mtl")) {
        for (const textureReference of GetTextureReferences(materialFile.bytes)) {
            addReferenceAlias(textureReference);
        }
    }

    const files = new Map<string, File>();
    const createdFiles = new Map<IOBJSourceFile, File>();
    for (const [key, companion] of aliases) {
        let file = createdFiles.get(companion);
        if (!file) {
            file = dependencies.createFile(companion);
            createdFiles.set(companion, file);
        }
        files.set(key, file);
    }

    const insertedEntries: Array<readonly [string, File]> = [];
    try {
        for (const [key, file] of files) {
            dependencies.store[key] = file;
            insertedEntries.push([key, file]);
        }
    } catch (error) {
        for (const [key, file] of insertedEntries) {
            if (dependencies.store[key] === file) {
                delete dependencies.store[key];
            }
        }
        throw error;
    }

    let isDisposed = false;
    return {
        rootUrl: `file:${rootKey}`,
        get isDisposed() {
            return isDisposed;
        },
        dispose() {
            if (isDisposed) {
                return;
            }
            isDisposed = true;
            for (const [key, file] of insertedEntries) {
                if (dependencies.store[key] === file) {
                    delete dependencies.store[key];
                }
            }
        },
    };
}
