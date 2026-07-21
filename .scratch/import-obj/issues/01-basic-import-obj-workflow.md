# Add the basic Import OBJ workflow end to end

Status: resolved
Blocked by: None

## Parent

[Add Import OBJ to Node Assets Editor](../PRD.md)

## Feature request context

This is an authorized internal NodeAssets proof-of-concept workflow. The repository's public feature-request template requires a forum Discussion; that requirement does not apply here.

## What to build

Deliver a complete minimal Import OBJ tracer from a typed OBJ source representation and connection-point kind through the Read OBJ primitive, OBJ-to-Universal transcoder, Import OBJ aggregate, editor discovery, persistence, worker execution, and a basic offline pipeline-library entry.

The runtime must model OBJ as its own shallow source payload rather than as Babylon or glTF. Add the ordinary typed path `Read OBJ -> OBJ to Universal`, with one Universal output exposed by the aggregate. Use Babylon's existing OBJ loader through its registration wrapper and `LoadAssetContainerAsync`, then convert through a NullEngine scene, the existing GLB exporter, WebIO, and Universal. Do not modify the loader or create a new parser. Support URL sources and exactly one local `.obj` file in this first slice; the source serialization must be compatible with adding companion entries in issue 02.

Preserve the sibling Read-block behavior for URL activation, last-successful source selection, stale requests, clear, failed-source handling, and malformed persisted source rejection. Keep the existing OBJ loader defaults and expose no loader-options UI. Preserve object/group names and multiple geometry through the conversion, while leaving companion-file handling and material/texture bundle behavior to issue 02.

Wire the runtime exports and package-barrel self-registration, editor descriptors and typed port style, default Inputs / Aggregate imports palette, Show primitives entries, aggregate child property forwarding, JSON persistence, worker build, and a basic network-free OBJ library entry. Do not add icons, code generation, or an NAE MCP server. Implement tests first at the highest existing seams.

## User stories covered

1. As a Node Assets Editor author, I want to discover Import OBJ in the default Inputs palette, so that OBJ is a first-class source.
2. As a graph author, I want Import OBJ to expose one Universal output, so that OBJ joins the Universal funnel.
3. As an advanced author, I want Read OBJ and OBJ to Universal under Show primitives, so that the typed primitive path is inspectable.
4. As a graph author, I want OBJ to remain a distinct source kind, so that the graph does not masquerade as another format.
5. As a user, I want to activate an OBJ URL or upload one local OBJ, so that simple OBJ sources build without companions.
6. As a source-block user, I want last-successful, stale-request, clear, and failed-source semantics to match sibling Read blocks, so that asynchronous source edits are predictable.
7. As a build user, I want OBJ to use the registered Babylon loader and existing GLB/Universal path, so that behavior is consistent and offline-capable.
8. As a graph author, I want a persisted Import OBJ graph to execute in a worker, so that editor and saved builds agree.
9. As a graph author, I want aggregate child properties forwarded, so that the compact node remains usable.
10. As an OBJ author, I want object/group names and multiple geometry to survive, so that basic structure is retained.
11. As a graph author, I want contextual source and conversion failures, so that invalid inputs are diagnosable.

## Acceptance criteria

- [x] A fresh graph can discover and add **Import OBJ** in **Inputs / Aggregate imports** by default.
- [x] With **Show primitives** enabled, **Read OBJ** and **OBJ to Universal** are discoverable; their source and Universal connection points are typed as OBJ and Universal rather than Babylon, glTF, or an untyped value.
- [x] The runtime path is a real typed `Read OBJ -> OBJ to Universal` aggregate with one Universal output, and the public exports and package-barrel self-registration make it available in a fresh runtime and worker context.
- [x] A simple URL OBJ builds through the existing Export glTF path into a non-empty inspectable GLB.
- [x] A single local `.obj` upload builds offline into the same kind of GLB; companion-file support is additive and remains compatible with the persisted source representation.
- [x] Multiple named OBJ objects/groups and their resulting multiple meshes survive the loader/export path with their names observable in the GLB.
- [x] URL activation stores the primary OBJ bytes and URL/source kind; a later URL request cannot overwrite a newer successful source; clear and failed activation preserve the established sibling semantics.
- [x] Invalid or malformed persisted OBJ source data is rejected contextually and cannot produce a misleading successful build.
- [x] Import OBJ exposes the forwarded Read OBJ source property section without duplicating or diverging from the primitive's value.
- [x] JSON roundtrip preserves the aggregate, source selection, names, and build behavior.
- [x] The worker can load the saved graph and build the basic OBJ workflow offline.
- [x] A basic network-free Import OBJ built-in pipeline/library entry builds successfully.
- [x] Babylon's default `materialLoadingFailsSilently: true` is preserved; a parsable OBJ with an unavailable referenced MTL succeeds as geometry-only, using existing loader/node diagnostics only and no new warning channel.
- [x] Focused runtime, editor, worker, and persistence tests cover the above public behavior, and existing glTF, USD, Babylon, and Node Geometry imports remain unchanged.
- [x] No icon, codegen, loader/parser, or NAE MCP changes are introduced.
- [x] Final review has no unresolved high-confidence findings.
- [x] Final integrated validation covers the complete basic and companion workflow.
- [x] Final integration landed in `preview/nae`.

## Blocked by

None.

## Delivery status (resolved)

The basic workflow landed with the complete feature in integration PR #36 at `d9d6ea015a3f99f3a6c7034a3328d3b15d6ecda5`. Final validation covered typed discovery and execution, URL activation and root/path semantics, local and worker builds, JSON roundtrip, the offline built-in pipeline, missing-MTL geometry-only behavior, and contextual source failures. The landed tree `62ea2116bc9fbab198971a3f1413b8952f812a84` exactly matches the validated integration tree.
