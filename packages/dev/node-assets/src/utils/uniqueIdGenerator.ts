/**
 * Helper class used to generate IDs unique to the current session.
 */
export class UniqueIdGenerator {
    private static _NextUniqueId = 1;

    /**
     * Gets a unique (relative to the current session) id.
     */
    public static get UniqueId(): number {
        if (!Number.isSafeInteger(this._NextUniqueId)) {
            throw new RangeError("The NodeAsset unique id range is exhausted.");
        }
        const result = this._NextUniqueId;
        this._NextUniqueId++;
        return result;
    }

    /**
     * Ensures subsequently generated ids are strictly greater than the given id. Called after
     * deserializing blocks so restored ids cannot collide with freshly generated ones.
     * @param id - The id that future ids must exceed.
     */
    public static EnsureIdsGreaterThan(id: number): void {
        if (!Number.isSafeInteger(id) || id < 0 || id >= Number.MAX_SAFE_INTEGER) {
            throw new RangeError("A restored NodeAsset id must be a non-negative safe integer with room for a subsequent id.");
        }
        if (this._NextUniqueId <= id) {
            this._NextUniqueId = id + 1;
        }
    }
}
