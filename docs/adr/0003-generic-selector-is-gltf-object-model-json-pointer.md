# Generic property access uses glTF Object Model JSON Pointers

> **Status: extended and scoped by [ADR 0006](./0006-domain-owned-versioned-selections.md).** The JSON
> Pointer selector triad remains the mechanism for the glTF representation. Milestone 07 scopes it as
> _one representation's_ addressing scheme (not a universal one), makes selections domain-owned and
> versioned (owner / version / target kind / cardinality / addresses), and defines how mutators remap or
> invalidate them. USD uses immutable overlay selectors instead. The reasoning below still holds for the
> glTF domain.

Instead of a bespoke block per editable property (SetExtras, Transform, ExtractTexture, …), a
property is addressed by a **glTF Object Model JSON Pointer** — the Khronos standard string
(e.g. `/nodes/0/translation`, `/materials/2/pbrMetallicRoughness/baseColorFactor`) already used by
Babylon's `KHR_animation_pointer` / `KHR_interactivity` and FlowGraph. A **Selector** node emits a
pointer; generic **GetProperty** and **SetProperty** blocks resolve it against the SCENE `Document`
via a small NAE-side path→accessor converter and get/set there.

## Considered Options

- **One typed block per property** (SetExtras, Transform, …) — rejected: doesn't scale to breadth,
  and the user found single-purpose nodes like SetExtras near-useless.
- **Reuse Babylon's `GLTFPathToObjectConverter` directly** — rejected: it targets Babylon runtime
  scene objects via the glTF loader, whereas NAE operates on the gltf-transform `Document` at build
  time. We borrow the pointer grammar and accessor concept but resolve against gltf-transform's
  property graph.

## Consequences

- One Selector + GetProperty + SetProperty triad subsumes set-extras (03), place/transform (05), and
  extract-texture (06).
- Pointers are single-target and index-based to start; multi-target selection (`/materials/*/…`
  wildcards, by-name queries) is a later, additive NAE extension, not part of the standard.
- NAE owns a Document-targeted path→accessor converter mirroring the loader's one; the two accessor
  target types deliberately differ.
