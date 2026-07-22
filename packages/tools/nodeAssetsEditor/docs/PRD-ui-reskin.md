## Summary

Redo the Node Assets Editor (NAE, `packages/tools/nodeAssetsEditor`) UI/UX so it looks and feels consistent with Babylon's established Node Editor family — NME (`nodeEditor`), NGE (`nodeGeometryEditor`), NRGE (`nodeRenderGraphEditor`), NPE (`nodeParticleEditor`) — while preserving all current NAE runtime behavior. Aggregate blocks must be represented as expandable, titled regions in the style of NME's custom frames (`GraphFrame`) — explicitly **not** like the Smart Filters Editor's (SFE) flat, opaque aggregate presentation. SFE is cited in this document only as an anti-pattern, never as a design target.

This is a **holistic reskin**, not an incremental patch list. Every existing user-facing NAE surface is inventoried below and either (a) mapped to an established sibling convention with a concrete, testable target, or (b) given an explicit, documented reason to diverge. This issue is the feature PRD for integration branch `docs/nae/ui-reskin-prd` (based on `preview/nae`; GitHub Issues are disabled on this fork, so this doc + its PR is the tracking artifact — implementation issue-sessions are the issue equivalents, decomposed at the bottom).

## Background / current-state research

NAE is **not** "Node Animation Editor" — per `packages/tools/nodeAssetsEditor/CONTEXT.md` it is the **Node Assets Editor**: a visual authoring tool for NodeAssets graphs (glTF/USD/OBJ/FBX/Babylon/Node Geometry import → optimize → export GLB pipelines).

**Locked architectural decision:** NAE keeps its own Fluent UI v9 / `MakeModularTool` / bespoke React+SVG canvas foundation. We do **not** port it onto the legacy, imperative, DOM-class-based `packages/dev/sharedUiComponents/src/nodeGraphSystem` that NME/NGE/NRGE/NPE all share — that system is unstyled by Fluent (only NME even wires up `FluentToolWrapper`/`ToolContext`, and even there it's an opt-in `?newUX=true` dual-render path that isn't the default). Regressing NAE onto it would be a technical downgrade. Instead, we **reproduce sibling visual/interaction conventions natively in Fluent** wherever a convention exists, and **document exceptions explicitly** wherever NAE's current approach is deliberately superior to or divergent from the shared legacy pattern.

## Surface-by-surface parity matrix

Legend: ✅ Already aligned (verify with a test) · 🔧 Needs work to align · ⛔ Documented exception (do not change) · ➕ New surface to add (universal sibling convention NAE currently lacks)

### 1. Shell / layout

All four siblings (NME/NGE/NRGE/NPE) render an **identical 3-column horizontal split** via `SplitContainer`/`Splitter` (`shared-ui-components/split/`): `[NodeList (200px, 180–350) | Canvas+Log (vertical split, Log 120px) | PropertyTab+Preview (vertical split, 300px, 250–500)]`.

NAE's `MakeModularTool` shell registers: Palette (left), Canvas (center), Properties (right/top), Preview (right/bottom), Validation (right/bottom, order 1).

| Surface | Sibling convention | NAE today | Verdict |
|---|---|---|---|
| Left pane = palette | ✅ universal | ✅ matches | ✅ |
| Center = canvas | ✅ universal | ✅ matches | ✅ |
| Right = properties (top) + preview (bottom) | ✅ universal | ✅ matches | ✅ |
| **Center-bottom Log/console panel** | ✅ universal (`LogComponent`, timestamped, auto-scroll, error entries in red) | ❌ absent — NAE only has ephemeral per-node diagnostics, no persistent build/action log | ➕ **Add a Log panel** (center-bottom, matching universal sibling anatomy) — timestamped entries for build start/success/failure, export, validation results; reuse the existing `GraphNodeDiagnostics`/`BuildOrchestrator` events as log sources |
| Responsive minimum-width blocker (<900px) | ✅ universal (`div.blocker`) | ❌ absent (not found in current research) | ➕ **Add a responsive blocker** at <900px matching sibling convention, Fluent-styled |
| Resizable panes | ✅ universal (`Splitter`, draggable) | ✅ `MakeModularTool` panes are resizable (`leftPaneDefaultWidth`, `rightPaneDefaultWidth`, `rightPaneMinWidth`) | ✅ |

### 2. Toolbar & command surfaces

All four siblings have **no shell-level toolbar** — every command lives as `ButtonLineComponent`/`FileButtonLine` rows inside titled, collapsible sections of the Properties panel's no-selection default view: **UI** (Zoom to fit, Reorganize), **FILE** (Save, Load, Generate code, Export), **SNIPPET** (Save/Load via snippet server), **GENERAL** (Name, Mode, Reset to default), etc.

NAE instead has a **dedicated compact toolbar** (Undo, Redo, ZoomToFit, Reorganize, Save, Load) at the shell level via `MakeModularTool`'s `toolbarMode: "compact"`.

**Revised verdict (corrected — subjective UX preference is not a valid basis for divergence; only a concrete domain constraint or a missing sibling analogue is):**

| Command | Sibling convention | Verdict |
|---|---|---|
| **Zoom to fit** | Grouped under a labeled **"UI"** section in the Properties panel default view, in every sibling | 🔧 **Align placement/grouping**: relocate into the Properties panel's default (no-selection) view, in a Fluent-styled, clearly labeled section equivalent to sibling's "UI" grouping (e.g., a titled `Accordion`/section named "View" or "UI" containing Zoom to fit + Reorganize together, mirroring the sibling's grouping semantics). Keep the Fluent implementation technology (accordion/button components), but match placement and grouping. |
| **Reorganize** | Same "UI" section, grouped with Zoom to fit | 🔧 Same relocation, grouped together with Zoom to fit per sibling convention (see above). |
| **Save** (→ NAE's Save-to-Library) | Grouped under a labeled **"FILE"** section | 🔧 **Align placement/grouping**: relocate into the Properties panel default view under a Fluent-styled section equivalent to "FILE", grouped with Load. |
| **Load** (→ NAE's Open-Library) | Same "FILE" section, grouped with Save | 🔧 Same relocation, grouped with Save per sibling convention. |
| **Undo** / **Redo** | **No visible analogue in any sibling** — undo/redo exist only as invisible `Ctrl+Z`/`Ctrl+Y` keyboard shortcuts in every one of NME/NGE/NRGE/NPE; no sibling renders an Undo/Redo button anywhere | ⛔ **Valid, narrow exception**: keep Undo/Redo as visible Fluent toolbar buttons. This qualifies under "missing sibling analogue" (not subjective superiority) — there is no sibling convention to align to for a *visible* undo/redo control, so NAE's addition is a net-new affordance, not a divergence from an existing pattern. Keep as-is. |
| MCP AI-assistant integration (`McpSessionComponent`) | ✅ present in all 4 siblings' Properties panel | ⛔ **Out of scope** — concrete constraint: this is a functional/product AI-assistant integration unrelated to visual/interaction reskin; adding it would be a feature addition, not a UI parity change. Not part of this PRD's acceptance criteria. |

**Net effect**: NAE's shell-level toolbar is reduced to Undo/Redo only (the one command pair with no sibling analogue to match). Zoom to fit, Reorganize, Save, and Load move into the Properties panel's default (no-selection) view, Fluent-styled, grouped into "View" and "File" sections that mirror sibling placement/grouping semantics. This is a real behavior change from NAE's current always-visible-toolbar convenience — tracked as its own work item (see Decomposition) since it touches shell registration (`nodeAssetsEditorService.tsx`) and the Properties panel (`PropertiesView.tsx`) directly.

### 3. Palette

| Surface | Sibling convention | NAE today | Verdict |
|---|---|---|---|
| Category grouping UI | `LineContainerComponent` (legacy) everywhere except NME's opt-in Fluent `Accordion` (`useFluent` dual-path) | Fluent `Accordion`/`AccordionHeader`/`AccordionPanel` | ✅ NAE already matches the *aspirational* Fluent target (NME's opt-in path), which none of the siblings default to. Keep. |
| Search/filter | Legacy `<input type="text">` everywhere except NME's opt-in Fluent `SearchBar` | Fluent `SearchBar` (`shared-ui-components`) | ✅ matches aspirational target |
| Drag-and-drop | HTML5 native DnD, custom MIME-ish string key per editor (`"babylonjs-material-node"`, `"babylonjs-geometry-node"`, etc.) | HTML5 native DnD, `PaletteDragFormat` key | ✅ same mechanism |
| Item presentation (icons/tooltips/spacing) | Plain text rows, no icons, no tooltips | Fluent `Tooltip`, `Caption1`/`Body1` typography, family separators | ✅ NAE already more polished; keep, just audit spacing consistency (see typography section) |
| Custom block/frame upload (NME-only) | File upload → localStorage → deletable | Not applicable to NAE's palette model | ⛔ Not a universal convention (NME-only); out of scope |

### 4. Canvas — background, grid, zoom/pan

| Element | Sibling convention (shared `graphCanvas.tsx`) | NAE today | Verdict |
|---|---|---|---|
| Background grid | CSS `linear-gradient` **line grid**, `#4f4e4f` hairlines, 20px spacing, toggleable (`ShowGrid` setting, default on), scales with zoom via `backgroundSize`/`backgroundPosition` | `tokens.colorNeutralBackground3` solid + radial-gradient **dot** grid, 24px spacing, `tokens.colorNeutralStroke2`, scales with zoom | ✅ **Functionally equivalent, stylistically modernized** — dot grid on Fluent tokens is an acceptable, superior translation of the line-grid convention. Acceptance: grid visible at zoom ≥ 0.5, hidden/merged below zoom 0.3, respects light/dark theme. |
| Zoom range | 0.1–4.0, wheel + Alt-drag, cursor-anchored | Confirm NAE's `ZoomTowardPoint` matches equivalent range/anchor behavior | 🔧 Verify NAE's zoom min/max and cursor-anchoring match this range; adjust if materially different |
| Pan | Left-drag empty canvas | Confirm equivalent | ✅ (assumed equivalent per existing `canvasCamera.ts`) |

### 5. Canvas — context menu, marquee, keyboard shortcuts

| Element | Sibling convention | NAE today | Verdict |
|---|---|---|---|
| Context menu | **None** in the shared canvas itself (each editor would have to add one; none do) | Fluent `<ContextMenu>`: canvas → Paste, Zoom to fit; node → Copy/Cut/Delete/Collapse; wire → Delete | ✅ NAE already exceeds the family baseline. Keep, and add "Disconnect all" (port) + frame-grouping actions (see Frames section) as further enhancements. |
| Marquee/selection box | Semi-transparent blue `rgba(72,72,196,0.5)`, solid blue 2px border, triggered by Ctrl+mousedown | `tokens.colorBrandBackground2` fill @ 0.3 opacity, `tokens.strokeWidthThin` brand-stroke border | ✅ equivalent semantics, Fluent-token colored — matches |
| Delete/Backspace | Deletes selection | Same | ✅ |
| Ctrl/Cmd+C / +V | Copy/paste | Same | ✅ |
| Ctrl/Cmd+X (cut) | **Not present** in shared canvas | Present in NAE | ⛔ NAE addition beyond family baseline — keep, it's strictly better |
| Ctrl/Cmd+Z / +Y (undo/redo) | Handled per-editor via `HistoryStack`, not in shared canvas | Handled natively in `GraphEditorState` | ✅ equivalent capability, better encapsulated |
| Space → add-node search overlay | ✅ universal (opens `SearchBoxComponent` at cursor) | Not implemented (NAE uses palette drag-and-drop only) | 🔧 **Optional enhancement, not required for parity** — palette drag-and-drop is a valid alternative interaction NAE already has; adding Space-to-search is a nice-to-have, not a gap. Do not block on this. |
| Ctrl+F find-in-graph | Opt-in (`enableFindInGraph`); NME/NPE do not enable it by default, so it's OFF in the actual running siblings today | Not implemented | 🔧 **Optional enhancement** (see Section 8) — not a hard gap since no sibling has it enabled by default either, but worth adding given NAE's graphs can grow large with aggregates. Lower priority than items marked 🔧 without this caveat. |
| Sticky notes | Opt-in (`enableStickyNotes`), off by default in NME/NPE | Not implemented | ⛔ Not required — opt-in and unused by defaults in siblings |
| Keyboard shortcut help/cheat-sheet | **None in any sibling** | None in NAE | ⛔ **Not a parity gap** — matches family convention (absence). Optional stretch enhancement only, not an acceptance criterion. |

### 6. Nodes

| Element | Sibling convention (`graphNode.ts`) | NAE today (`GraphNodeView.tsx`) | Verdict |
|---|---|---|---|
| Container | 200px wide, gray bg, 4px black border, 12px radius, drop-shadow | `tokens.colorNeutralBackground1` bg, `tokens.colorNeutralStroke1` border, `tokens.borderRadiusMedium`, `tokens.shadow4` | ✅ Fluent-token translation already correct |
| Header | Black bg, 30px row height, top-radius 8px | `node.headerColor` inline, `NodeHeaderHeight=32px`, `tokens.borderRadiusMedium` top corners | ✅ matches (32px vs 30px is negligible) |
| Title typography | 16px, `"acumin-pro"`, center-aligned | Fluent `<Caption1>` (~12px), left-aligned | 🔧 **Gap: title is visually smaller than sibling convention.** Change from `Caption1` to `Body1` or `Subtitle2` token to better match the ~16px sibling title size while staying Fluent-native. Keep left-alignment (Fluent convention) unless design review prefers center. |
| Collapse chevron | Local SVG `dropdownArrowIcon_white.svg`, rotates -90° when collapsed | `ChevronDownRegular`/`ChevronRightRegular` from `@fluentui/react-icons` | ✅ NAE's Fluent-icon approach is the correct modernization — keep |
| Selection highlight | 4px border turns white | `tokens.strokeWidthThick` border `tokens.colorBrandStroke1` + `tokens.shadow8` | ✅ equivalent semantics, Fluent-native — keep (brand-blue instead of white is an acceptable, better choice given Fluent theming) |
| Error/diagnostic badge | 16px red circle, CSS `"!"` pseudo-content | `ErrorCircleRegular` Fluent icon | ✅ keep — Fluent icon is the correct modernization |
| Comments label (italic text above node) | ✅ universal | ❌ absent | 🔧 **Add**: an optional per-node comment string shown above the node, Fluent typography (e.g. `Caption1` italic, `tokens.colorNeutralForeground3`) |
| Execution-time label (bottom-right, debug) | ✅ universal | ❌ absent | ⛔ **Documented exception — out of scope.** This is a runtime-debug feature tied to shader/graph execution profiling in NME/NGE/NRGE/NPE; NAE's "execution" is an async build pipeline with its own BUILD ERROR section and Validation pane, which already serves the equivalent purpose. Do not add a literal execution-time label. |
| Breakpoint badge | ✅ universal (debug feature) | ❌ absent | ⛔ **Out of scope** — NAE has no breakpoint/step-debug concept; not applicable to a build-pipeline editor. |

### 7. Ports

| Element | Sibling convention (`nodePort.ts`) | NAE today | Verdict |
|---|---|---|---|
| Shape | Circular dot, 20×20px, no shape-coding by type/direction | Circular dot, ~12px visual / 24px hit target | 🔧 **Gap: NAE's port dot is smaller than sibling convention (12px vs 20px).** Increase visual port size to align (keep the larger hit target); do not introduce shape-coding (siblings don't do it either — circle-only is the established convention). |
| Type coloring | Per-type color via editor-specific `applyNodePortDesign` | Per-type/family inline hex (to be token-driven per Item 1's canvas-foundations work) | 🔧 covered by the token-driven recolor work already in flight |
| Hover state | `filter: brightness(2)` | **Absent** | 🔧 **Add**: brighten/highlight port on hover using a Fluent-token treatment (e.g., `tokens.colorBrandBackground1` tint or `filter: brightness(1.3)`) |
| Incompatible-connection glow | Red glow + dim (`box-shadow` + `filter: brightness(0.7) saturate(0.3)`), opt-in | **Absent** | 🔧 **Add**: red glow (`tokens.colorPaletteRedBackground3` box-shadow) + dim when a drag-candidate wire is over an incompatible port |
| Drag-to-connect visual | Straight dashed candidate line | Bezier dashed `tokens.colorBrandStroke1` | ✅ equivalent, arguably better (bezier vs straight) |

### 8. Wires

| Element | Sibling convention (`nodeLink.ts`) | NAE today | Verdict |
|---|---|---|---|
| Shape | Cubic bezier, horizontal tangents, capped at 300px | Cubic bezier via `BuildWirePath` | ✅ matches |
| Stroke width (default) | 4px | 2px | 🔧 Minor gap — consider bumping to 3px for closer visual weight while keeping crispness at low zoom (`vectorEffect="non-scaling-stroke"` already present) |
| Selected | White dashed | `tokens.colorBrandStroke1` solid 3px | ✅ **Documented exception** — brand-blue solid is the correct Fluent-native translation; do not literally copy "white dashed." |
| Hover | 16px transparent hit-area brightens to white @ 0.4 opacity | **Absent** | 🔧 **Add**: subtle hover treatment on the existing 12px transparent hit-area (e.g., `tokens.colorBrandStroke2` @ 0.5 opacity) |
| Gradient (differing endpoint colors) | ✅ universal | Not confirmed | 🔧 Verify/add: wire gradients between differently-colored ports, matching sibling visual richness |
| Flow animation (build/data-flow pulse) | ✅ universal (`triggerFlowAnimation`) | ❌ absent | ⛔ **Documented exception — optional, not required.** This animates *runtime* data flow, which doesn't map cleanly onto NAE's async build-pipeline model (builds happen in a worker, not as a live per-wire evaluation). Consider a **build-in-progress** pulse on wires touched by the current build as a stretch enhancement, not a hard acceptance criterion. |
| Delete gesture | Select + Delete key | Same | ✅ |

### 9. Frames & aggregates (the PRD's centerpiece)

| Element | NME `GraphFrame` convention | NAE today | Verdict |
|---|---|---|---|
| Visual: header + title + color + fill | Header 100% opacity of `color`, body 70% opacity fill, editable title (`contentEditable`), draggable header | `GraphFrameView.tsx`: border `frame.color`, fill @ 12% opacity, header `frame.color`, `FrameHeaderHeight=28px` | 🔧 **Gap: NAE's fill opacity (12%) is much lower than NME's (70%).** Align fill opacity closer to NME's convention for visual consistency (exact value subject to Fluent-theme legibility testing — target range 40–70%). |
| Collapse/expand | Collapses to 200px, hides members, projects boundary `FrameNodePort`s, dblclick header toggles | Aggregate node ↔ expanded aggregate frame (semantically equivalent: collapsed aggregate node ≈ collapsed frame w/ boundary ports; expanded aggregate frame ≈ expanded frame) | ✅ **Conceptually already aligned** — this is NAE's existing strength. Acceptance: verify collapse/expand interaction parity (single click via chevron in NAE vs dblclick-header in NME — document NAE's click-to-chevron as the equivalent, Fluent-appropriate trigger). |
| Resize (8 handles) | ✅ | ❌ absent for both aggregate and (nonexistent) user frames | 🔧 **Add** resize handles (see Frame authoring/parity issues below) |
| Comments row | ✅ optional 3-row grid | ❌ absent | 🔧 **Add** optional comments row on frames |
| User-authored layout frames | ✅ (drag-select → frame creation is implicit via marquee-with-Shift in the shared canvas) | ❌ **totally absent** — only aggregate-projection frames exist | 🔧 **Biggest gap. Add "group into frame" authoring** (tracked issue: frame authoring) |
| Frame serialization | `IFrameData`: id/name/position/size/color/collapsed/comments/blocks/ports | `IEditorFrameMetadata` (additive fields planned) | 🔧 extend additively as part of frame-authoring work |
| Aggregate-specific: cannot be independently deleted | N/A (NME frames are always user-deletable) | ✅ existing NAE invariant — aggregate frames only removable by collapsing | ⛔ **Keep as NAE-specific invariant**, explicitly different from generic NME frames (which are always freely deletable) — document this divergence, it's required by NAE's aggregate semantics. |
| Aggregate presentation (the "what NOT to do") | — | — | ⛔ Explicitly reject SFE's flat/opaque single-node aggregate presentation (no inline expansion) — already avoided by NAE's design; keep it that way. |

### 10. Properties pane

| Element | Sibling convention | NAE today | Verdict |
|---|---|---|---|
| Section wrapper | `PropertyTabComponentBase` (NME) or plain `<div id="propertyTab">` (NGE/NRGE/NPE) — legacy `LineContainerComponent` | Fluent `Accordion`/`AccordionSection` | ✅ NAE's Fluent approach is the aspirational target — keep |
| Property line renderers | Legacy `*LineComponent` (TextInputLineComponent, SliderLineComponent, etc.) | Fluent HOCs (`TextInputPropertyLine`, `SyncedSliderPropertyLine`, etc. from `shared-ui-components/fluent`) | ✅ keep, this is the shared Fluent migration target all editors are meant to converge on eventually |
| Color property editing | N/A (siblings don't have a generic color-property abstraction in the same way) | Plain text + regex validator | 🔧 **Add real Fluent `ColorPicker`** (already scoped as its own issue) |
| No-selection default view | Populated with FILE/SNIPPET/OPTIONS/GENERAL command sections (siblings) | Bare "No selection" text | 🔧 **Gap, but scoped differently than siblings**: NAE's toolbar already owns global commands (documented exception in §2), so NAE's no-selection view doesn't need to replicate FILE/SNIPPET sections. It only needs a proper Fluent empty-state (icon + message) instead of bare italic text — already scoped as its own issue. |
| Frame / frame-port / node-port property tabs | `FramePropertyTabComponent`, `FrameNodePortPropertyTabComponent`, `NodePortPropertyTabComponent` — dedicated views per selection kind | NAE's `PropertiesView` currently only branches on node selection | 🔧 **Add**: dedicated property sections when a frame (user or aggregate) is selected (name/color/comments editing — ties into frame-parity work) and when a port is selected (type info at minimum) |

### 11. Dialogs, popovers, modals

| Element | Sibling convention | NAE today | Verdict |
|---|---|---|---|
| Confirmations / inputs | **Native browser `window.alert/prompt/confirm`** — universal across all 4 siblings, no Fluent Dialog anywhere in the family | Fluent `Dialog` (Library), `MessageBar` (Validation) | ⛔ **Documented exception — keep Fluent Dialog/MessageBar.** Native browser dialogs are legacy technical debt in the sibling family, not a target to replicate; they're also inconsistent with a Fluent-native app shell. NAE's approach is the correct forward-looking pattern. |
| Pop-out preview window | `CreatePopup()` child window — confirmed present in **100% of siblings** (NME, NGE, NRGE, NPE all call `CreatePopup("PREVIEW AREA", {...})` from `shared-ui-components/popupHelper`) | NAE's preview is inline only (`PreviewPane`, `keepMounted: true`) | 🔧 **Required, not optional.** This is a universal convention with no NAE-specific domain constraint making it inapplicable — NAE's Preview pane shows rendered GLB/image output, directly analogous to siblings' mesh/material preview. Reuse the exact same shared `CreatePopup()` helper siblings already use (this is literally shared, reusable code — lowest-risk path). Add a pop-out button to `PreviewPane.tsx` alongside the existing preview controls, opening the same live preview content in a child window via `CreatePopup("PREVIEW", {...})`, matching sibling placement/behavior (`keepMounted` canvas must survive the transition between inline and popped-out states, matching how NME's `PreviewAreaComponent` handles `showPreviewPopUp`). |

### 12. Status / feedback surfaces

| Element | Sibling convention | NAE today | Verdict |
|---|---|---|---|
| Log/console panel | ✅ universal, see §1 | ❌ absent | ➕ tracked in §1 |
| Wait/processing overlay | `div.wait-screen` full-cover text overlay | `Spinner` overlay in `PreviewPane` during build | ✅ equivalent, Fluent-native — keep |
| Build success/error feedback | Logged to console panel (NGE logs success explicitly; others error-only) | Node diagnostics (error only, ephemeral) + will gain Log panel entries (§1) | 🔧 once Log panel is added, log both success and failure (matching NGE's more complete convention) |
| Validation feedback | N/A (no sibling has a glTF-validation concept) | `GLTFValidationPane` with Fluent `MessageBar` | ⛔ **NAE-specific, keep** — no equivalent exists in the family; this is core NAE domain functionality, not a divergence to fix. |

### 13. Empty / loading / error states

| Element | Sibling convention | NAE today | Verdict |
|---|---|---|---|
| Empty graph canvas | No placeholder/illustration (universal) | Same (no placeholder) | ✅ matches — do not add a "drag a block to start" illustration, it would be a divergence from the family |
| Properties "no selection" | N/A (siblings show FILE/SNIPPET commands instead, per §2/§10 exception) | Bare italic text → Fluent empty-state (already scoped) | 🔧 tracked, see §10 |
| Library "no saved entries" | N/A | Not confirmed — verify a sensible empty state exists in the Library dialog's "Saved" tab | 🔧 verify/add as part of library-management work |

### 14. Typography, spacing, color tokens, icons

| Element | Sibling convention | NAE today | Verdict |
|---|---|---|---|
| Font system | Hardcoded `"acumin-pro"`/`"acumin-pro-condensed"`, no design-token system, no shared SCSS variables file | Fluent v9 typography components (`Caption1`, `Body1`, `Body1Strong`, `Subtitle2`) + `tokens.fontFamilyBase` | ✅ **NAE's Fluent typography system is the correct forward path** — the sibling family has no token system to replicate; keep Fluent tokens throughout. Only fix: node title size (§6). |
| Color system | Hardcoded hex/rgba literals, no CSS custom properties | Fluent `tokens` (`colorNeutralBackground*`, `colorBrandStroke*`, etc.) + a residual set of hardcoded per-block-family hex (being tokenized in the canvas-foundations work) | ✅ direction correct, finish the in-flight tokenization work |
| Icons | Local SVG file imports (`dropdownArrowIcon_white.svg`, `add.svg`, `delete.svg`), CSS pseudo-content for badges — **no Fluent icons anywhere in the legacy family** | `@fluentui/react-icons` throughout (`ChevronDownRegular`, `ChevronRightRegular`, `ErrorCircleRegular`, `ChevronUpRegular`, etc.) | ✅ **NAE already exceeds the family baseline.** Keep Fluent icons exclusively; do not introduce raw SVG file imports for consistency with the legacy pattern — that would be a regression. |
| Spacing scale | No shared scale; ad hoc pixel values per component | Fluent `tokens.spacingHorizontal*`/`spacingVertical*` | ✅ keep; audit for consistency (part of canvas-foundations/palette-polish work) |

### 15. Theming

| Element | Sibling convention | NAE today | Verdict |
|---|---|---|---|
| Light/dark theme support | Dark-only, hardcoded hex; only NME has an opt-in `FluentToolWrapper`/`?newUX=true` path (off by default) | Full Fluent light/dark via `showThemeSelector: true` in `MakeModularTool`, all `makeStyles`/`tokens`-driven | ✅ **NAE already leads the family here.** Keep and finish tokenizing the remaining hardcoded header/port colors (canvas-foundations work) so theming is 100% consistent. |

## Goals

- G1: Every surface in the matrix above reaches its "Verdict" target: ✅ verified with a test, 🔧 implemented and verified, ➕ added and verified, or ⛔ left intentionally as documented.
- G2: Aggregate blocks are represented and interacted with using the NME custom-frame model (§9): collapsed = compact node exposing only public ports; expanded = titled, resizable, colorable, commentable frame containing primitive nodes and internal wires.
- G3: Users can author arbitrary layout frames (§9) — closing the biggest concrete gap identified.
- G4: Preserve 100% of current NAE runtime/build/export/validation/library behavior; this is a UI/UX-layer change only.
- G5: Keep NAE's existing Fluent v9 / `MakeModularTool` / bespoke-canvas architecture; do not introduce the legacy `nodeGraphSystem`, SCSS, native browser dialogs, or raw SVG icon imports.
- G6: Add the two universal sibling surfaces NAE currently lacks outright: a Log/console panel (§1) and a responsive minimum-width blocker (§1).
- G7: Maintain and extend automated coverage (Vitest unit + Playwright e2e + visual verification) so regressions are caught before merge.

## Non-goals

- NG1: Do not port NAE's canvas engine to the shared `nodeGraphSystem`, and do not port NME/NGE/NRGE/NPE onto NAE's canvas engine.
- NG2: Do not change NodeAssets runtime/build semantics, block registry, `@dev/node-assets` package, or GLB export/validation logic.
- NG3: Do not change the aggregate/primitive/palette *data model* beyond what's needed to support new interactions (frame authoring, frame/port property tabs).
- NG4: Do not adopt the Smart Filters Editor's flat/opaque aggregate presentation — explicitly rejected pattern, cited nowhere else in this PRD as a target.
- NG5: Do not remove or degrade any existing Playwright-covered behavior.
- NG6: Do not replicate sibling technical debt when relocating commands into the Properties panel (§2): implement with Fluent components (sections/accordion/buttons), not legacy `LineContainerComponent`/`ButtonLineComponent`. Do not adopt native `window.alert/prompt/confirm` dialogs, raw SVG icon imports, or regress the Fluent Dialog-based pipeline library to a snippet-ID/`window.prompt()` pattern — those remain documented exceptions per §11/§14.
- NG7: Do not add MCP AI-assistant integration, execution-time labels, or breakpoint badges — out of scope, not applicable to NAE's build-pipeline domain (see §6, §2).
- NG8: Keyboard-shortcut help/cheat-sheet UI and Ctrl+F find-in-graph are optional stretch enhancements, not required acceptance criteria — no sibling editor has either as an enabled-by-default feature.

## Acceptance criteria (screenshot / visual + representative workflows)

Every 🔧/➕ item in the parity matrix must have:
1. A concrete, testable implementation (exact tokens/values used, cited in the PR description).
2. Playwright coverage asserting the new/changed behavior.
3. A before/after screenshot pair attached to its PR (or a Playwright visual snapshot if the project supports it) demonstrating the change against the matrix's target.

**Representative end-to-end workflows to visually verify before the feature PR is marked ready** (run manually and attach screenshots to the final integration PR):
1. Load the default pipeline → confirm grid, node, port, wire styling matches the matrix, Log panel shows build success entry.
2. Import glTF → expand its aggregate → observe NME-style frame chrome (resize handles, color, comments-capable) → collapse → confirm boundary-port equivalence.
3. Multi-select 3 primitive nodes → group into a new user frame → rename/recolor/resize it → ungroup → confirm underlying nodes unaffected, undo/redo works at each step.
4. Select a node with a color property → open the new Fluent `ColorPicker` → change value → confirm build re-triggers.
5. Deselect everything → confirm the new Fluent empty state (not bare text).
6. Trigger a build failure (e.g., disconnect a required input) → confirm the Log panel logs the error, the responsible node shows its diagnostic badge, and the BUILD ERROR properties section appears.
7. Save a pipeline to the Library, rename it, delete it → confirm Fluent Dialog-based flow (not a native prompt) end-to-end.
8. Resize the browser below 900px width → confirm the new responsive blocker appears, matching sibling convention.
9. Toggle light/dark theme → confirm every recolored surface (grid, node headers, ports, frames) adapts correctly.

## Compatibility

- No changes to saved graph JSON schema beyond additive fields (frame metadata, comments) — must remain backward-loadable.
- No changes to `@dev/node-assets` public API.
- No changes to library `localStorage` schema version unless additive, with migration if unavoidable.

## Testing

- Extend `test/unit/` (Vitest) for: frame creation/grouping logic, token-based color mapping, color picker property binding, log-entry generation.
- Extend `test/playwright/nodeAssetsEditor.test.ts` (or new spec files) for every 🔧/➕ item per the acceptance criteria above.
- Full existing Playwright suite (`--project=nodeAssetsEditor`) must remain green — zero regressions.
- Visual verification of the 9 representative workflows above before the feature PR is marked ready.

## Rollout

- All work lands on feature branches → PRs targeting **`docs/nae/ui-reskin-prd`** (the feature integration branch/PR; never push directly to `preview/nae`, and never target `preview/nae` from an individual work-item PR).
- `docs/nae/ui-reskin-prd` (PR #42) stays in **draft** until all decomposed work items are integrated, feature-level validation passes, and the 9 representative workflows are visually verified — then it is retitled from "PRD" to the full feature summary and handed to the creator session, which owns merging into `preview/nae`.
- Sequencing: (1) canvas/palette visual foundations + typography fix + responsive blocker + port sizing → (2) frame authoring → (3) frame visual/interaction parity (depends on 2) + Log panel (independent) → (4) properties pane (color picker, empty state, frame/port property tabs, node comment field) → (5) toolbar/command relocation to Properties panel (depends on 4, shares `PropertiesView.tsx`) → (6) port/wire interaction states (hover, incompatible glow) → (7) library management → (8) canvas interaction polish (disconnect-all, optional find-in-graph) → (9) feature-level validation and final integration.

## Risks

- R1: Frame-authoring UI has no prior NAE implementation to extend — highest-effort, highest-risk item; sequence it early.
- R2: Token-driven header/port recoloring touches `blockCatalog.ts`, read by both palette and canvas — verify no visual regressions across all block types.
- R3: Aggregate-frame/user-frame visual unification must not weaken the "aggregate frames aren't independently deletable" invariant.
- R4: Because NAE's canvas is hand-rolled, every sibling convention must be reinterpreted/reimplemented natively in `src/nodeGraph/*` — no shortcut of importing shared components.
- R5: Adding a Log panel changes the shell layout (new pane) — must integrate cleanly with `MakeModularTool`'s panel registration without disrupting existing panel sizing/behavior.
- R6: Scope creep risk in the *other* direction — this matrix explicitly marks several items ⛔ out-of-scope/exception; implementers must not "over-fix" those (e.g., do not add native browser dialogs, do not add MCP integration, do not add execution-time labels).

## Decomposition

Tracked as coordinated implementation sessions (issue-session equivalents, since GitHub Issues are disabled on this fork). Each lands as its own PR against `docs/nae/ui-reskin-prd`. See the coordinating session's task tracker for current status; work items derived from this matrix include (dependency-ordered): canvas & palette visual foundations (grid/tokens/typography/responsive-blocker), frame authoring, frame visual/interaction parity, Log panel, properties pane Fluent polish (color picker/empty-state/frame-port property tabs), port & wire interaction states, library entry rename/delete, canvas interaction polish (disconnect-all/optional find-in-graph), and final feature-level validation.
