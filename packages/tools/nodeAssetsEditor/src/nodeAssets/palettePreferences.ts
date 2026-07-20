import { type IPalettePreferences } from "../nodeGraph/paletteModel";

/** Browser-storage subset used by palette preferences. */
export interface IPalettePreferenceStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}

const ShowPrimitivesStorageKey = "BabylonJS.NodeAssetsEditor.ShowPrimitives.v1";

/** Persists palette discovery preferences without coupling them to graph state. */
export class PalettePreferences implements IPalettePreferences {
    public constructor(private readonly _storage: IPalettePreferenceStorage) {}

    public get showPrimitives(): boolean {
        return this._storage.getItem(ShowPrimitivesStorageKey) === "true";
    }

    public set showPrimitives(value: boolean) {
        this._storage.setItem(ShowPrimitivesStorageKey, String(value));
    }
}
