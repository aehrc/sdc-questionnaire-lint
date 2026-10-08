# Source-mapping fixtures

SUSHI projects whose `fsh-generated/` was compiled by SUSHI 3.20.1, with `hl7.fhir.r4.core#4.0.1` and `hl7.fhir.uv.sdc#4.0.0`. The tests in `packages/core/test/source/fixtures.test.ts` and `packages/core/test/cli/source-map.test.ts` read them; they never run SUSHI.

| Project | What it covers |
| :- | :- |
| `forms` | A standalone Questionnaire whose `id` differs from its Instance name (`Standalone.fsh`), repeated expressions told apart by linkId, extension and name, and ones nothing tells apart (`Anchors.fsh`), a parameterised RuleSet and repeated text in a definition with an insert (`WithInsert.fsh`), inline Questionnaires in a Bundle and in `contained`, with a Patient sharing an id (`Inline.fsh`), and CRLF line endings (`Crlf.fsh`). |
| `indexed` | An Instance of the SDC package profile `sdc-questionnaire`, which only the SUSHI index can identify. |
| `stale-index` | `indexed`, with two lines added above the Instance after compiling, so the index's `startLine` is stale. |
| `missing-index` | `indexed`, with `fsh-generated/data/fsh-index.json` and `fsh-generated/fsh-index.txt` removed. |
| `escaping-index` | `indexed`, with `Form.fsh` moved to `outside/`, the index's `fshFile` changed to `../../outside/Form.fsh`, and `input/fsh/Unrelated.fsh` added so `input/fsh` exists. |

`forms/input/fsh/Crlf.fsh` keeps its CRLF line endings through `.gitattributes`. It has no byte order mark: SUSHI 3.20.1 reads a byte order mark as part of the first token and reports an error, so a project with one cannot compile cleanly. The unit tests cover byte order marks.

To regenerate a compiled project, change to its directory and run `sushi .`, then repeat the changes listed above for the variants of `indexed`.
