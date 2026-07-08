# Fluent node-editor UI skeleton — standalone package + dummy app

Status: ready-for-agent

## Parent

`.scratch/node-assets/PRD.md`

## Why this is its own slice

This is the **pure-visual, pure-frontend** slice carved out of `04-fluent-node-editor` so it can be
built and iterated on **immediately** — independently of the NodeAssets runtime spine, whose
contracts are still being redesigned. It has **no dependency on the operation registry, the runtime,
the graph definition, or gltf-transform.** Everything it renders is hardcoded dummy data.

It is highly visual and Playwright-driven, which makes it a good candidate to build and refine on its
own. Later, `04-fluent-node-editor` consumes this skeleton and wires it to the real registry +
runtime (palette becomes registry-driven, dummy nodes become real operation instances, run / save /
load / preview become real).

## What to build

A **new standalone package** containing two things:

1. **A fresh, Fluent-based node-graph-system UI framework** — the reusable canvas + panels that could
   later become the shared node editor for Babylon's node tools (NME, NGE, NRGE, NPE, …). Built from
   scratch on Fluent; **do not** depend on the legacy `sharedUiComponents/src/nodeGraphSystem/`.
2. **A dummy demo app** that feeds the framework hardcoded dummy data and renders the classic
   three-panel node-editor structure.

The demo app must reproduce the **structure and intended behaviors of Babylon's node editors today**
(reference: the Node Material Editor). That is:

- **A left palette pane** — a filterable, collapsible, **categorized** list of operations (dummy
  categories + dummy operation names). A search/filter box at the top actually filters the list.
  Dragging an item onto the canvas adds a dummy node.
- **A center canvas** — dummy **nodes**, each with a colored header (title + collapse chevron) and a
  body listing named, typed **ports** (inputs on the left, outputs on the right, as colored dots),
  connected by curved **wires** (bezier). Grid background; pan and zoom. Nodes are draggable.
  Selecting a node highlights it and drives the properties pane.
- **A right properties pane** — accordion sections (e.g. GENERAL / UI / OPTIONS) of property lines
  reflecting the selected node: text inputs, dropdowns, sliders, switches, and action buttons
  (e.g. "Reset to default", "Zoom to fit", "Reorganize"). Below it, a **preview placeholder** box
  (the future live viewport — just a labeled placeholder tonight, no real Babylon scene).
- **A toolbar** — dummy run / save / load actions (no-ops or console logs are fine).

**The editor is fully interactive — a working editor with dummy data, not a static mock.** Every
affordance a real Babylon node editor has is present and functional against the dummy model:

- **Node management** — select a node (click), or several at once (marquee box-select and
  shift-click); drag the selection; **delete** nodes (Delete key or context menu), which also removes
  their attached wires; **copy / cut / paste** nodes.
- **Wire management** — drag port→port to connect (only compatible pairs); **delete / disconnect** a
  wire (context menu or select + Delete).
- **Canvas** — pan, zoom, a **zoom-to-fit** control, and a **minimap** overview in a corner.
  Right-clicking the canvas or a node opens a **context menu** (`fluent/primitives/contextMenu`) with
  the relevant actions.
- **Nodes** — the header collapse chevron actually **collapses / expands** the node body.
- **Frames** — nodes can be grouped into a titled, colored **frame** (the NME "Custom Frames"): the
  frame moves its contained nodes with it and can be collapsed.
- **Undo / redo** — graph edits (add, move, delete, connect, paste) are undoable and redoable.

Keep the reusable framework components (canvas, node, port, wire, palette pane, properties pane)
**cleanly separated** from the demo app's dummy data, so the framework could later be promoted/shared
and fed real data. The framework should render whatever visual model it's handed; the demo app is the
only place the dummy data lives.

Heavy or app-specific concerns stay out: **no** registry, **no** runtime execution, **no**
gltf-transform, **no** real preview scene. The only editor control that stays hollow is
**Reorganize / auto-layout** — keep the button present but a no-op; a real graph-layout algorithm is
the one genuine rat-hole not worth an unattended night (everything else above must actually work).

## Follow the `porting-tools-to-fluent` skill

Build this to the conventions in the repo's **`porting-tools-to-fluent`** skill
(`.github/skills/porting-tools-to-fluent/SKILL.md`). It was written for *porting* existing tools off
the legacy `shared-ui-components`, but its conventions are exactly the "new way" we want for a tool
built fresh.

The target transformation is **the same skeleton as the node editors today, rebuilt with the new
Fluent components** — precisely what Inspector V2 is to the legacy Inspector: same panel structure
(explorer/palette + central content + properties), a cleaner modern Fluent look. Use
**`packages/dev/inspector-v2/`** as the primary reference implementation for the shell architecture
(it is a full `MakeModularTool` + `IShellService` tool: see `src/inspector.tsx`), and
`packages/tools/viewer-configurator/` as a secondary reference.

- **Bootstrap with `MakeModularTool`** (`sharedUiComponents/src/modularTool/modularTool.tsx`) — it
  provides theming, settings, and the shell layout — instead of an ad-hoc `createRoot`.
- **Lay the tool out with `IShellService`** (`modularTool/services/shellService.tsx`): the graph
  canvas is the central content (`addCentralContent`); the palette and the properties pane are side
  panes (`addSidePane`); the run / save / load actions are toolbar items (`addToolbarItem`).
- **Build UI from `sharedUiComponents/src/fluent/` primitives and HOCs** — e.g. `accordion` +
  `searchBar` for the palette; `pane` and the `propertyLines/*` HOCs (`inputPropertyLine`,
  `dropdownPropertyLine`, `syncedSliderPropertyLine`, `switchPropertyLine`, `buttonLine`, …) for the
  properties pane; `draggable` for palette drag; `button`. Style with `makeStyles` from
  `@fluentui/react-components`; icons from `@fluentui/react-icons`.
- **Wire reactive state with `useObservableState`** and the service-architecture pattern (service
  identities / contracts / factories).
- **Match the shared design system** in `.github/design-guidelines.md`.

**Where we diverge from the skill:** the skill tells porters to keep the legacy
`sharedUiComponents/src/nodeGraphSystem/` canvas out of scope and port only the surrounding shell. We
have no legacy canvas to preserve — building the graph canvas **fresh** (no `nodeGraphSystem`
dependency) is a central point of this slice. So apply the skill's conventions to everything *around*
the canvas (shell, palette pane, properties pane, toolbar) and build the canvas itself as new
Fluent-styled work.

## Dummy data model (build to this shape)

A deliberately **editor-agnostic visual model** — just enough for the framework to render. It is NOT
NodeAssets-specific; that is what makes the framework promotable later. Lives in the demo app; the
framework takes it via props. Names/types may be refined.

```ts
// Dummy data ONLY — no import from the NodeAssets runtime spine.
type DummyPort = { id: string; name: string; direction: "input" | "output"; color: string };
type DummyNode = {
    id: string;
    title: string;
    headerColor: string;
    ports: readonly DummyPort[];
    position: { x: number; y: number };
};
type DummyWire = { id: string; fromPortId: string; toPortId: string };
type DummyFrame = {
    id: string;
    label: string;
    color: string;
    position: { x: number; y: number };
    size: { width: number; height: number };
    nodeIds: readonly string[]; // nodes grouped by this frame
};
type DummyPaletteItem = { id: string; label: string };
type DummyPaletteCategory = { label: string; items: readonly DummyPaletteItem[] };
```

The demo app hardcodes a handful of nodes, a few wires between them, at least one frame grouping some
of them, and several palette categories — producing a canvas that visibly resembles a real node
editor. The framework holds this as mutable editor state that supports **snapshot/restore** (for
undo/redo) and **clone** (for copy/paste); the demo app only seeds the initial data.

## Acceptance criteria

**Done means every criterion below is demonstrably working against the dummy data.** This slice is a
fully-fledged, fully-interactive node editor that simply has no real engine behind it — not a partial
mock. All criteria carry equal weight; the editor is not done until each one works.
- [ ] A new standalone package builds and runs a demo app (vite dev server), laid out like the
      existing tools editor packages (`packages/tools/nodeEditor`, `viewer-configurator`).
- [ ] The app is bootstrapped with `MakeModularTool` and laid out via `IShellService`: canvas =
      central content; palette + properties = side panes; run / save / load = toolbar items.
- [ ] The three panels render from dummy data and visibly resemble the Node Material Editor structure:
      categorized filterable palette (left), node canvas with nodes + typed ports + curved wires
      (center), accordion properties pane + preview placeholder (right).
- [ ] The reusable node-graph framework components are separated from the demo's dummy data, depend on
      **no** `nodeGraphSystem`, and depend on **nothing** from the NodeAssets runtime spine.
- [ ] UI is built from `sharedUiComponents/src/fluent` primitives/HOCs and styled with `makeStyles`,
      consistent with Inspector V2 / viewer-configurator.
- [ ] The palette filter box filters the categorized list.
- [ ] Nodes are draggable on the canvas; the canvas pans and zooms.
- [ ] Selecting a node updates the properties pane; editing a property line updates that node's
      displayed state.
- [ ] Palette and properties accordion sections collapse/expand.
- [ ] Dragging from one port to a compatible port draws a new wire.
- [ ] Dragging a palette item onto the canvas creates a new dummy node.
- [ ] Multiple nodes can be selected via marquee box-select and shift-click, and the whole selection
      drags together.
- [ ] A node can be deleted (Delete key or context menu); deleting it also removes its attached wires.
- [ ] A wire can be deleted / disconnected (context menu or select + Delete).
- [ ] Right-clicking a node or the canvas opens a context menu (`fluent/primitives/contextMenu`) with
      the relevant actions.
- [ ] The node header collapse chevron collapses and expands the node body.
- [ ] The canvas has a working zoom-to-fit control and a minimap overview.
- [ ] Nodes can be copied / cut and pasted.
- [ ] Nodes can be grouped into a movable, titled frame (NME "Custom Frames"); moving the frame moves
      its contained nodes.
- [ ] Graph edits (add, move, delete, connect, paste) are undoable and redoable.
- [ ] A Playwright test loads the running app and captures a screenshot of the full three-panel
      skeleton, following `.github/instructions/editor-interaction.instructions.md` and the porting
      skill.

## Relationship to other slices

- **Unblocks / precedes** `04-fluent-node-editor`, which later replaces the dummy data with the real
  registry-driven palette and runtime-wired nodes, and makes run / save / load / preview real.
- Independent of `01-runtime-spine` — can run in parallel.

## Blocked by

None — can start immediately.
