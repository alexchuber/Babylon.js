# Fluent node editor — canvas, palette, wiring, properties, save/load

Status: ready-for-agent

## Parent

`.scratch/node-assets/PRD.md`

## What to build

The visual authoring surface: a fresh, Fluent-based node editor over the same operation registry,
so a pipeline author can assemble and run a pipeline without writing code.

Scaffold a new tool package (following the existing tools editor packages). Build a fresh editor on
**Fluent** (the same component library and style as Inspector V2), keeping the familiar bones but
rebuilt from scratch — do **not** reuse the legacy shared node-graph-system framework. It has:

- **A canvas** of **nodes**, each showing its named typed **ports**, connected by **wires**.
- **A palette panel** populated from the operation registry — dragging an operation adds a node.
- **Connection type-compatibility enforcement** — only format-compatible ports connect; incompatible
  connections are rejected.
- **A properties panel** for the selected node, to edit that operation's settings.
- **Save / load of the graph definition** — the editor serializes the current graph and reloads it
  faithfully.
- **A "run → download output glTF" action** — executes the current graph through the runtime and
  lets the author download the result. (No live viewport yet; that's slice 05.)
- **The compression-last validation warning** surfaced in the UI when the graph violates it.

Because the palette is registry-driven, whatever operations are registered (import, export, Draco,
KTX2, and any added later) appear automatically.

### Follow the `porting-tools-to-fluent` skill

Build this editor to the conventions in the repo's **`porting-tools-to-fluent`** skill
(`.github/skills/porting-tools-to-fluent/SKILL.md`). That skill was written for *porting* existing
tools (NME, NGE, Flow Graph Editor) off the legacy `shared-ui-components`, but its conventions are
exactly the "new way" we want for a tool built fresh:

- **Bootstrap with `MakeModularTool`** (from `shared-ui-components/modularTool/`) instead of an ad-hoc
  `createRoot` — it provides theming, settings, and the shell layout.
- **Lay the tool out with `IShellService`**: the graph canvas is the central content
  (`addCentralContent`); the registry-driven palette and the node properties panel are side panes
  (`addSidePane`, using `ExtensibleAccordion` for filtering/pinning); the run / save / load actions are
  toolbar items (`addToolbarItem`).
- **Build UI from `shared-ui-components/fluent/` primitives and HOCs** — `PropertyLine` HOCs for the
  properties panel, `FileUploadLine` for loading a graph definition, the shared `Dialog` primitive for
  dialogs. Style with `makeStyles` from `@fluentui/react-components`; icons from `@fluentui/react-icons`.
- **Wire reactive state with `useObservableState`** and the service-architecture pattern (service
  identities / contracts / factories; `MakeXService(options)` for instance-scoped data).
- **Match the shared design system** in `.github/design-guidelines.md`, using
  `packages/tools/viewer-configurator/` as the reference implementation.

**Where we diverge from the skill:** the skill tells porters to *keep the legacy
`shared-ui-components/nodeGraphSystem/` canvas out of scope* and port only the surrounding shell. We
have no legacy canvas to preserve — building the graph canvas fresh (no `nodeGraphSystem` dependency)
is the whole point of this slice. So apply the skill's conventions to everything *around* the canvas
(shell, palette pane, properties pane, toolbar, dialogs, save / load) and build the canvas itself as
new Fluent-styled work.

## Acceptance criteria

- [ ] A new tool package hosts a Fluent-based editor consistent with Inspector V2's look and
      component usage.
- [ ] The editor follows the `porting-tools-to-fluent` skill: bootstrapped with `MakeModularTool`,
      laid out via `IShellService` (canvas = central content; palette + properties = side panes;
      run / save / load = toolbar items), built from `shared-ui-components/fluent/` primitives and
      styled with `makeStyles`.
- [ ] The palette lists operations sourced from the registry; adding one places a node on the canvas.
- [ ] Nodes display named typed ports; wiring two compatible ports succeeds and wiring incompatible
      ports is prevented.
- [ ] Selecting a node shows its settings in a properties panel, and edits update the node.
- [ ] The editor saves the current graph to a graph definition and reloads it faithfully.
- [ ] A "run" action executes the current graph through the runtime and lets the user download the
      output glTF.
- [ ] The compression-last validation warning is visible in the editor when the graph violates it.
- [ ] The editor does not depend on the legacy shared node-graph-system framework.

## User stories covered

PRD stories 1, 3, 6, 7, 8, 9, 10, 33.

## Blocked by

- `01-runtime-spine`
