# Source-mapping fixture

A SUSHI project whose `fsh-generated/` was compiled by SUSHI 3.20.1, with `hl7.fhir.r4.core#4.0.1` and `hl7.fhir.uv.sdc#4.0.0`. `packages/core/test/source/fixtures.test.ts` reads it, in process, and never runs SUSHI. The end-to-end test through the CLI uses `examples/health-check`.

| File | What it holds |
| :- | :- |
| `input/fsh/Mapped.fsh` | Expressions that map: an Instance of the package profile `sdc-questionnaire`, which only the SUSHI index can identify, with an `id` that differs from its name; a query and its fragment; repeated expressions told apart by name, linkId, extension (one named by an alias), primitive element and sub-extension, catalogued and uncatalogued; escaped quotes; inline Questionnaires in a Bundle and in `contained`, with a Patient sharing an id. |
| `input/fsh/Unmapped.fsh` | Expressions that do not map, one per reason: repeated text nothing tells apart, `"""` literals, an expression a parameterised RuleSet writes, and repeated text in a definition with an insert. |

What SUSHI cannot compile, such as a byte order mark, is covered by unit tests.

To regenerate, change to this directory and run `sushi .`.
