# SmartArt review fixes — 2026-10-05

The independent T3 Code review found four issues. The SDK and shared dialog now reject stale opening snapshots, honor protected worksheet text, preserve unchanged paragraph formatting, and participate in the editors' modal keyboard lifecycle.

Reviewed code:

- SDK PR [ONLYOFFICE/sdkjs#4893](https://github.com/ONLYOFFICE/sdkjs/pull/4893), `7ebea40b1b447a05d2f8ba10142fa6a77be8d6e4`.
- UI PR [ONLYOFFICE/web-apps#3227](https://github.com/ONLYOFFICE/web-apps/pull/3227), `d6aa77288eafd7d35e883e5c76d6acaf9176c11f`.

| Finding | Fix and regression coverage |
| --- | --- |
| R1: intervening diagram edits overwritten by an old dialog | Pass the opening outline to the SDK as an expected snapshot; reject stale text and structure without creating history. The dialog stays open with a conflict message. |
| R2: worksheet Lock Text bypassed | Check native selected-text protection and all diagram text shapes before applying, including after font/object-lock callbacks. Preserve text unlock flags when rebuilding. |
| R3: unchanged paragraph spacing overwritten | Respect explicit line spacing and merge individual spacing properties with the existing paragraph-spacing helper. Preserve before/after spacing even when line spacing is unspecified. |
| R4: editor keys enabled while the dialog remained open | Register the dialog through the existing modal notification lifecycle. Test the actual editor blur/modal callbacks, cancellation, rejected Apply and nested modals. |

Validation:

- The remaining sparse-spacing regression failed before the last SDK fix, then passed in all 11 SDK product/build combinations: Word/Cell/Slide/PDF web and desktop configurations, Word/Cell/Slide mobile configurations. Each passed 152/152 checks, including all 151 SmartArt presets. These are SDK configuration tests, not native application builds.
- Formatting checks cover unchanged Apply, an unrelated added/reordered node, Undo/Redo, and PPTY serialization/reopen, checking both model and rendered paragraphs.
- All four main and three mobile browser UI production builds succeeded with the dialog fix. The deployed shared dialog matches the reviewed source exactly, and the conflict message is present in all three mobile bundles. The UI builds completed at 2026-10-05T10:34:53.648725+02:00.
- Normal 9.4.0 SDK assets were rebuilt after the variant checks.

[Machine-readable build/test validation](validation.json). [Independent final review](final.json): all four findings resolved; no remaining concrete findings. Fresh reproductions verified the spacing fix in Documents and Presentations and reconfirmed snapshot rejection, worksheet text protection and modal keyboard behavior.

The [existing live screenshots/videos](../../README.md) were recorded on 2026-10-03 with the commits listed there. They have not been relabeled as captures of these newer review fixes. The independent review uses isolated real SDK/dialog browser reproductions; it does not replace a live multi-client test or full DocumentServer recapture. Native Desktop Editors shell and standalone iOS/Android builds, native mobile UI integration, live mobile captures, saved PDF SmartArt roundtrip and live multi-client collaboration remain unverified or outside the PR scope as described in the gallery.
