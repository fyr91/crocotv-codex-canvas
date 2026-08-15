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

---

# Playground Parameter Control Heights — Design QA

## Comparison Target

- Source report: `/var/folders/79/k_qqj6wx2sb92z55ktjwrvh40000gn/T/codex-clipboard-ee1f5a33-568c-4bd8-95e8-9867cf2f7bed.png` (517 × 293 px).
- Verified implementation crop: `/tmp/studio-parameter-controls-crop.png`, captured from the Studio production build at a 1280 × 720 CSS viewport.
- Side-by-side comparison: `/tmp/studio-parameter-controls-comparison.png`; both captures use the dark theme and the same text-to-video parameter state.

## Findings

- The source defect was not isolated to the duration control: dropdowns, the duration stepper, and pill groups used three different effective heights because local padding compounded the global 40px minimum-height rule.
- All default controls in `ParameterBar` now use the existing 40px Studio/Canvas control token. Runtime measurements confirm 40px for aspect ratio, resolution, duration, batch generation, and advanced pill groups.
- Nested stepper inputs and selected pill buttons explicitly clear the global minimum height, so they fit within their 40px parent instead of expanding it.
- The compact filters and timing controls elsewhere in Studio remain unchanged because they belong to the separate 32px compact density.

## Interaction And Runtime Checks

- Duration increment changed `6` to `7`; batch selection moved from `x1` to `x2`; the aspect-ratio menu opened; advanced parameters expanded.
- Fresh production-preview console: no errors.
- Component geometry test, all 55 Studio UI tests, Studio typecheck, color-token guard, Studio production build, and full repository build passed.
- `GET /api/status` returned HTTP 200 from the running local API.
- MCP surface is unchanged because this task only normalizes UI geometry and does not change persisted parameters, generation behavior, or remotely callable commands.

## Issue Status

- P0: none.
- P1: none.
- P2: none in the confirmed Playground parameter-bar scope.
- Separate audit note: compact numeric fields in the Storyboard timing/shot panels can be normalized to their intended 32px density in a dedicated follow-up; they are not part of this 40px control group.

final result: passed

---

# Studio UI Polish — Design QA

## Comparison Targets

- Playground source visual truth: `/var/folders/79/k_qqj6wx2sb92z55ktjwrvh40000gn/T/codex-clipboard-8c6358f2-bce2-4d07-9575-54f8efcc0fa4.png` (462 × 272 px).
- Playground implementation: `/tmp/codex-ui-polish-playground-focused.png` (372 × 174 px focused component capture), rendered at a 1280 × 720 CSS viewport.
- Series dialog source visual truth: `/var/folders/79/k_qqj6wx2sb92z55ktjwrvh40000gn/T/codex-clipboard-f6b53135-f19d-44ab-96d2-7dca3869ab4b.png` (907 × 894 px).
- Series dialog implementation: `/tmp/codex-ui-polish-series-matched.png` (907 × 894 px), rendered at a matching 907 × 894 CSS viewport.
- Draft badge source visual truth: `/var/folders/79/k_qqj6wx2sb92z55ktjwrvh40000gn/T/codex-clipboard-cb7c45c7-424c-4d32-98e0-37551b71122d.png` (706 × 100 px).
- Draft badge implementation: `/tmp/codex-ui-polish-workspace-focused.png` (700 × 110 px focused workspace capture), rendered at a 1280 × 720 CSS viewport.
- Browser density: `devicePixelRatio: 1`; browser screenshot pixels equal CSS pixels. Comparison boards used contain-fit normalization into equal 620 × 700 px regions without changing aspect ratio.

## State And Evidence

- Theme: Studio dark theme in all source and implementation captures.
- Playground state: video-generation top-level tab selected; only `文生 / 图生 / 参考生 / 编辑` submodes visible.
- Series state: new-series dialog open; basic workflow selected; the second workflow card disabled and labelled `更多流程正在开发中`.
- Workspace state: gallery and list views both checked with draft projects visible.
- Full-view evidence: `/tmp/codex-ui-polish-playground-current.png`, `/tmp/codex-ui-polish-series-matched.png`, `/tmp/codex-ui-polish-workspace.png`.
- Focused comparison evidence: `/tmp/codex-ui-polish-playground-comparison-focused.png`, `/tmp/codex-ui-polish-series-comparison-matched.png`, `/tmp/codex-ui-polish-workspace-comparison-focused.png`.
- Primary interactions tested: image/video category switching, category-specific submode visibility, new-series menu opening, disabled workflow card state, workspace gallery/list switching.
- Console checked. The existing result fixtures emit a missing `playground.card.imageUnavailable` translation error; it predates and is outside the confirmed controls, workflow-card, and badge scope. No console error was introduced by the changed interactions.

## Findings

- No actionable P0, P1, or P2 mismatch remains in the confirmed scope.
- Fonts and typography: existing Studio type families, weights, tracking, hierarchy, and compact submode labels are preserved; the final video submode row does not wrap.
- Spacing and layout rhythm: the new primary category tabs fit the existing mode card and preserve its radius, padding, and two-level hierarchy. The series dialog matches the reference at the normalized viewport.
- Colors and visual tokens: draft badges now use dedicated green foreground, border, and background semantic tokens in gallery and list views. Runtime computed colors confirm the green state without changing operational pending-state blue tokens.
- Image quality and asset fidelity: no raster imagery is introduced or replaced. Category and workflow affordances use the repository's existing Lucide icon library.
- Copy and content: series workflow copy exactly reuses the new-project disabled state. Content-mode and visual-control copy remain unchanged.

## Comparison History

1. Initial Playground pass found a P2 wrapping issue after expanding all four video submode labels. The labels were restored to compact context-aware copy because the new `视频生成` primary tab already supplies the category context.
2. Post-fix evidence in `/tmp/codex-ui-polish-playground-comparison-focused.png` shows a single-line four-option row with an unambiguous selected video category.
3. The first series comparison used a shorter browser viewport that cropped the modal. The capture was normalized to the source's 907 × 894 viewport; `/tmp/codex-ui-polish-series-comparison-matched.png` confirms the complete dialog and card alignment.

## Open Questions

- None for the confirmed scope. The unrelated missing result-card translation can be handled as a separate bug if desired.

## Implementation Checklist

- [x] Use semantic green tokens for draft badges in gallery and list views.
- [x] Present image and video generation as accessible top-level tabs.
- [x] Render only the submodes belonging to the selected category.
- [x] Share one basic-workflow selection component between project and series dialogs.
- [x] Force new-series creation to submit the basic `r2v` workflow.
- [x] Verify tests, type checks, production build, interactions, and visual states.

## Follow-up Polish

- No P3 polish item is required for acceptance.

final result: passed
