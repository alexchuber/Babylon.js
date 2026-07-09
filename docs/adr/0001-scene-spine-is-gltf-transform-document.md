# The SCENE spine is the gltf-transform Document

Every 3D format we ingest (USD, FBX, OBJ, STL, CAD, …) is transcoded on import into a single
normalized in-graph representation — the gltf-transform `Document` — and format only reappears at
export. We chose glTF's data model as the spine because it is the web-delivery target anyway, has a
mature typed JS property graph (gltf-transform), and keeps every middle block format-agnostic; the
accepted cost is that anything glTF can't express (CAD B-rep/parametrics, USD layering/variants, FBX
rigs beyond skin+morph) is approximated or dropped at the import boundary, with `extras` as the
escape hatch for data we want to carry through losslessly.

## Consequences

- Middle and export blocks never branch on source format — they only see a `Document`.
- Breadth of input formats becomes "write another import transcoder," not "teach every block a new
  type."
- Import transcoders are inherently lossy funnels; each one's loss profile should be documented so
  users aren't surprised.
