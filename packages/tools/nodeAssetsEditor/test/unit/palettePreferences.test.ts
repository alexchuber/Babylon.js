import { describe, expect, it } from "vitest";

import { PalettePreferences, type IPalettePreferenceStorage } from "../../src/nodeAssets/palettePreferences";

class MemoryStorage implements IPalettePreferenceStorage {
    private readonly _values = new Map<string, string>();

    public getItem(key: string): string | null {
        return this._values.get(key) ?? null;
    }

    public setItem(key: string, value: string): void {
        this._values.set(key, value);
    }
}

describe("PalettePreferences", () => {
    it("defaults Show aggregates off and restores its persisted value", () => {
        const storage = new MemoryStorage();
        const preferences = new PalettePreferences(storage);

        expect(preferences.showAggregates).toBe(false);

        preferences.showAggregates = true;

        expect(new PalettePreferences(storage).showAggregates).toBe(true);
    });
});
