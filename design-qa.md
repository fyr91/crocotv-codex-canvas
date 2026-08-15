# Studio × Canvas Visual QA

## Target protocol

- [x] Use the Canvas system font stack everywhere; remove Studio display/serif/Google-font dependencies.
- [x] Match Canvas type scale: 12/18 caption, 14/22 body and controls, 16/24 supporting title, 20/28 card/section title, 36/41.4 page title.
- [x] Promote legacy 10–12px Studio UI copy to the Canvas 14/22 baseline; retain 12/18 only for true captions and version metadata.
- [x] Match Canvas controls: 32px compact, 40px default, 10px control radius, 14/22 regular labels.
- [x] Match Canvas card and panel surfaces, borders, radii, shadows, focus ring, and 16px dot workspace grid.
- [x] Use the exact Canvas light and dark OKLCH surface/foreground/border/primary tokens.
- [x] Retain semantic color only for real pending, processing, completed, failed, and starred states.
- [x] Remove decorative gradients, glow, bloom, grain, colored shadows, and preset-theme visual effects.

## Screen coverage

- [x] Workspace — light and dark, gallery/list controls, empty and populated states.
- [x] Asset Library — cards, filters, search, sort, star state.
- [x] Script Editor — toolbar, side panels, editor, footer state.
- [x] Playground — mode selector, prompt panel, model/parameter controls, results workspace.
- [x] Pipeline Script — editor, CTA, previous-episode panel.
- [x] Art Direction — recommendation block, preset filters/cards, footer action.
- [x] Cast — rail, empty state, asset workbench surface.
- [x] Storyboard — shot card, tabs, editor, queue and generation controls.
- [x] Assembly — phase tabs, timeline and variants panel.
- [x] Settings and project configuration modals — mode switch, form fields, model cards, aspect-ratio selection, modal overlay.
- [x] Global chrome — text-only 视频工坊 title, CrocoTV return link above the title, and Canvas-identical 28px light/dark icon toggle on every shell.

## Comparison and issue status

- [x] Same-viewport Canvas/Studio light comparison completed at 1280×720.
- [x] Same-viewport Canvas/Studio dark comparison completed at 1280×720.
- [x] P0 — none open.
- [x] P1 — legacy theme presets replaced by Canvas light/dark; hardcoded palette and Script Editor dark-only values removed.
- [x] P2 — colored selection states, decorative gradients/emoji, inconsistent title weights, radii, shadows, and compact primary-button sizing normalized.

## Functional boundary

- [x] Studio routes, project state, API calls, workflow actions, and Canvas mapping behavior are unchanged.
- [x] MCP surface unchanged because this pass only alters presentation and theme state.

## Workflow copy and button contrast

- [x] Rename the recommended Studio path to `基础流程` and the older Studio path to `分步制作`; remove internal compatibility and component names from user-facing descriptions.
- [x] Keep the internal `r2v` / `i2v_legacy` state values unchanged so existing Studio projects continue to open through the same workflow implementation.
- [x] Use a dedicated green recommendation badge in both light and dark themes, including workflow and model recommendation tags.
- [x] Normalize primary, secondary/glass, muted, semantic-status, enabled, and disabled button foregrounds across both themes.
- [x] Runtime contrast audit completed for Workspace, Create Project, Settings, Model Settings, API Keys, Script Editor, and Playground; no visible text button measured below 4.5:1 in the tested light/dark states.
- [x] Same-state before/after comparisons inspected for the Workspace empty-state buttons and Create Project workflow cards.
- [x] Full repository build, Studio typecheck, color-token guard, and all 94 Studio tests passed.

final result: passed
