import { describe, expect, it } from "vitest";

// This test pins the editor's block-descriptor set to the runtime's registered-block set so the two
// can never silently drift apart. It deliberately imports BOTH sources of truth in this realm:
//  - the node-assets package barrel, which registers EVERY runtime block (the authoritative set the
//    preview-build worker can deserialize), and
//  - the editor's blockDescriptors index, whose per-block modules register EVERY editor descriptor.
// A runtime block added without an editor descriptor (or a descriptor pointing at a class the runtime
// never registers) is exactly the "unknown block type" drift class that already bit the preview
// worker; here it surfaces as a failing parity assertion instead of a block with no palette entry,
// no property pane, and no reconciler mapping. Importing the barrel is intentional (unlike the
// worker-registration test, which avoids it to prove the worker self-registers): parity needs the
// full runtime set to compare against.
import "node-assets";
import "../../src/nodeAssets/blockDescriptors";

import { GetRegisteredBlockClassNames } from "node-assets/blockFoundation/blockRegistry";

import { GetAllBlockDescriptors } from "../../src/nodeAssets/blockCatalog";

describe("Block descriptor ↔ runtime registry parity", () => {
    it("registers an editor descriptor for exactly the set of runtime blocks", () => {
        const runtimeClassNames = [...GetRegisteredBlockClassNames()].sort();
        const descriptorClassNames = GetAllBlockDescriptors()
            .map((descriptor) => descriptor.className)
            .sort();

        // Guards against a false green if a broken import left both registries empty.
        expect(runtimeClassNames.length).toBeGreaterThan(0);
        expect(descriptorClassNames).toEqual(runtimeClassNames);
    });

    it("maps each runtime block to a single descriptor (no duplicate className)", () => {
        const descriptorClassNames = GetAllBlockDescriptors().map((descriptor) => descriptor.className);

        expect(new Set(descriptorClassNames).size).toBe(descriptorClassNames.length);
    });
});
