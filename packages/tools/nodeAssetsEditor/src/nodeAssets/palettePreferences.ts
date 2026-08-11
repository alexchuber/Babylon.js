import { type IPalettePreferences } from "../nodeGraph/paletteModel";

/** Browser-storage subset used by palette preferences. */
export interface IPalettePreferenceStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}

const ShowAggregatesStorageKey = "BabylonJS.NodeAssetsEditor.ShowAggregates.v1";

/** Persists palette discovery preferences without coupling them to graph state. */
export class PalettePreferences implements IPalettePreferences {
    public constructor(private readonly _storage: IPalettePreferenceStorage) {}

    public get showAggregates(): boolean {
        return this._storage.getItem(ShowAggregatesStorageKey) === "true";
    }

    public set showAggregates(value: boolean) {
        this._storage.setItem(ShowAggregatesStorageKey, String(value));
    }
}
