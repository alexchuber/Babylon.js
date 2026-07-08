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
}
