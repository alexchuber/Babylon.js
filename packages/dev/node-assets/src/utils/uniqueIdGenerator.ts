/**
 * Helper class used to generate IDs unique to the current session.
 */
export class UniqueIdGenerator {
    private static _NextUniqueId = 1;

    /**
     * Gets a unique (relative to the current session) id.
     */
    public static get UniqueId(): number {
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
        if (this._NextUniqueId <= id) {
            this._NextUniqueId = id + 1;
        }
    }
}
