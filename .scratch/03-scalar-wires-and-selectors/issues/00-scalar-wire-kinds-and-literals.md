# 00 — Scalar wire kinds (NUMBER / STRING / JSON) + literal source nodes

Status: ready-for-agent

## Parent

`.scratch/03-scalar-wires-and-selectors/PRD.md` · Glossary: `packages/dev/node-assets/CONTEXT.md`
(**connection point type**: the kinds are SCENE, IMAGE, BYTES, **NUMBER**, **STRING**, **JSON**;
**value literal**: `NumberLiteral` / `StringLiteral` / `JsonLiteral` — "source blocks with no inputs and
one scalar output") · Decisions: `docs/adr/0002-wire-payload-is-kind-plus-opaque-value.md` (kind-equality
only, flat enum), `docs/adr/0003-generic-selector-is-gltf-object-model-json-pointer.md` (these scalars
feed the selector triad).

## Goal

Give the graph its first **non-SCENE payloads**. Add three scalar wire kinds — **NUMBER**, **STRING**,
**JSON** — to `NodeAssetConnectionPointType`, and three literal source blocks — `NumberLiteral`,
`StringLiteral`, `JsonLiteral` — each with no inputs and one typed output whose value is edited in the
properties pane. After it, the palette has a **Values** category and any block input can be fed a
constant, including a Selector's pointer string (issue 01) and a SetProperty value (issue 04).

## Why this is its own slice

It is the foundation the rest of slice 03 stands on: the Selector, GetProperty, and SetProperty all wire
STRING/JSON ports, so the kinds and a way to source them must exist first. It is **purely additive** —
appending enum members cannot break existing SCENE wiring (ADR 0002 is kind-equality only) — so it lands
green with just its own literal-node tests, independent of the converter and the selector triad.

## KISS ground rules (read first)

- **Additive enum, no reshape.** Append `NUMBER`, `STRING`, `JSON` to the flat
  `NodeAssetConnectionPointType` enum next to `SCENE`. Do **not** add per-kind classes, generics, or a
  type-compatibility matrix — `connectTo` stays **kind-equality only** (ADR 0002).
- **Literals are source blocks, modeled on `importGLTFBlock.ts`** — extend `NodeAssetBlock`, register a
  single typed output in the constructor, hold the value as a public serialized property. There is no
  async work; `_buildBlockAsync` just sets `output.value` from the stored literal.
- **No shared `LiteralBlock` base.** Three tiny near-identical files (Number / String / Json) are cheaper
  than the wrong abstraction (ADR 0002 style). A `JsonLiteral` whose value happens to be a number is not
  a substitute for `NumberLiteral` — keep the kinds distinct.
- **JSON value is stored as parsed data**, serialized with the rest of the block; validate it parses when
  edited, don't invent a schema.

## What to build

- **`NodeAssetConnectionPointType`** — append `NUMBER`, `STRING`, `JSON` members with doc comments (a
  plain number; a UTF-8 string, including a pointer; a JSON-serialisable value — array / object /
  primitive). `SCENE` stays the spine.
- **`NumberLiteral` / `StringLiteral` / `JsonLiteral`** — each a source block, no inputs, one output of
  the matching kind; the value is a public property (`value: number` / `value: string` / `value: unknown`)
  surfaced as an editor property line and serialized / deserialized. Sketch:

  ```ts
  // src/Blocks/stringLiteral.ts (Number/Json are the same shape with a different kind + value type)
  export class StringLiteral extends NodeAssetBlock {
      public static override ClassName = "StringLiteral";
      public value = "";                                  // edited in the properties pane
      public readonly output: NodeAssetConnectionPoint;   // STRING

      public constructor(name: string, nodeAsset: NodeAsset) {
          super(name, nodeAsset);
          this.output = this._registerOutput("output", NodeAssetConnectionPointType.STRING);
      }

      public override async _buildBlockAsync(): Promise<void> {
          this.output.value = this.value;
      }
      // serialize() / _deserialize() persist `value`
  }

  RegisterBlock(StringLiteral.ClassName, (name, asset) => new StringLiteral(name, asset));
  ```

- **Editor exposure** — a **Values** palette category (distinct header color from Sources / Operators);
  each literal self-registers its descriptor + a property line for its value (text for String / JSON, text
  or slider for Number), using the existing property-line descriptors. Add **port colors** for the new
  NUMBER / STRING / JSON kinds alongside `ScenePortColor` so the new ports render distinctly.
- Export the three blocks from `src/index.ts`.

## Tests

Headless `buildAsync()` is the primary seam:

- **Literal output test** — for each literal, build the block, `buildAsync()` (or `_buildBlockAsync`) and
  assert `output.value` equals the stored value and `output.type` is the right kind.
- **Save/load roundtrip** — a graph containing each literal serializes and `NodeAsset.Parse`es back with
  value + wiring intact (prior art: the existing serialize/Parse tests in
  `test/unit/nodeAsset.test.ts`). This also proves each literal self-registered with the runtime registry.
- **Kind-equality wiring** — a STRING output connects to a STRING input, but a STRING→SCENE `connectTo`
  throws (`incompatible connection point types`), confirming the new kinds respect ADR 0002.
- **Editor Playwright** only if the Values palette / property-line interaction needs coverage; prefer
  headless.

## Acceptance criteria

- [ ] `NodeAssetConnectionPointType` has `NUMBER`, `STRING`, `JSON` members (additive; `SCENE` unchanged),
      each documented.
- [ ] `NumberLiteral`, `StringLiteral`, `JsonLiteral` exist in `src/Blocks/`, each a source block (no
      inputs, one typed output) modeled on `ImportGLTFBlock`, with the value a public serialized property.
- [ ] **No** literal base class / generic literal is introduced; `connectTo` stays kind-equality only.
- [ ] The three blocks self-register (`RegisterBlock`) and are exported from `src/index.ts`; they appear
      under a **Values** palette category with a value property line; NUMBER / STRING / JSON ports have
      distinct colors.
- [ ] Headless tests assert each literal's output value/kind and that all three round-trip through
      save/load; kind-equality wiring is enforced.
- [ ] `lint:check` + `format:check` pass.

## Blocked by

None — can start immediately. The SCENE rename (slice-02 issue 00) is already **DONE** and block
self-registration (slice-02 issue 01) has **landed**, so the enum already reads `SCENE` and
`RegisterBlock` / `RegisterBlockDescriptor` are available to build on. **Unblocks** issue 01 (Selector),
issue 03 (GetProperty), and issue 04 (SetProperty), which all wire STRING/JSON ports and use these
literals to feed pointers/values in tests.
