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

# Character Binding Image Picker — Design QA

**Evidence**

- Source visual truth: `/var/folders/79/k_qqj6wx2sb92z55ktjwrvh40000gn/T/codex-clipboard-e7f37948-5252-4040-a505-3dc8886d0525.png` (813 × 394 px).
- Browser-rendered implementation: `/tmp/croco-character-image-preview-dropdown-implementation.png` (1440 × 900 px).
- Viewport: 1440 × 900 CSS px at device pixel ratio 1, dark theme, Character Resource Binding modal with the primary-image menu open.
- Comparison input: the source and implementation images were inspected together; the focused comparison used the primary-image trigger, open menu rows, selected state, and retained large preview region.

**Findings**

- No actionable P0, P1, or P2 differences remain for the requested change.
- Fonts and typography continue to use the existing Studio type hierarchy; filenames retain the existing 14 px control treatment and truncate safely in the narrow column.
- Spacing and layout preserve the three-column binding form, 40 px trigger height, existing border radius, and the large image preview below the selector.
- Colors and tokens reuse the existing surface, elevated, hover, border, muted-text, focus-ring, and primary-color tokens.
- Image quality is materially improved over the native selector: the trigger shows the selected image at 28 px and each menu row shows a 40 px source thumbnail without stretching. Failed images fall back to the existing image icon.
- Copy remains unchanged: “不选择” is retained, and resource filenames are shown beside their thumbnails.

**Primary Interactions Tested**

- Opened the primary-image menu and verified four synchronized image resources render with four real thumbnails.
- Selected `小林 · chest-image.png` and verified both the compact trigger thumbnail and the existing large preview update.
- Opened the menu with Arrow Down and closed it with Escape.
- Verified no browser console errors were emitted during the interaction.

**Implementation Checklist**

- [x] Add a compact selected-image thumbnail before the filename.
- [x] Add a thumbnail before every image option.
- [x] Keep the explicit “不选择” option and selected-row checkmark.
- [x] Preserve the existing large preview and binding payload.
- [x] Support mouse, Arrow keys, Home/End, Enter/Space, Escape, and outside-click closing.
- [x] Show a non-breaking fallback when a thumbnail cannot load.

**Comparison History**

- Initial implementation comparison found no P0/P1/P2 mismatch. No visual-fix iteration was required.

**Follow-up Polish**

- No blocking follow-up polish identified.

final result: passed

# Entity Extraction Inline Edit — Design QA

## Evidence and state

- Source visual truth: `/var/folders/79/k_qqj6wx2sb92z55ktjwrvh40000gn/T/codex-clipboard-bc25e5e5-d8cb-4fe5-a5d1-0936e681e3ff.png` (302 × 270 px).
- Full browser capture: `/Users/raymond/Projects/crocotv-codex-canvas/data/runtime/design-qa/entity-preview-inline-edit/entity-preview-before.png` (1280 × 720 px).
- Focused dialog capture: `/Users/raymond/Projects/crocotv-codex-canvas/data/runtime/design-qa/entity-preview-inline-edit/entity-preview-dialog.png` (512 × 394 px).
- Edit and removal states: `entity-preview-editing.png` and `entity-preview-after-remove.png` in the same runtime directory.
- Browser: Codex In-app Browser; dark theme; 1280 × 720 CSS viewport; `devicePixelRatio = 1`; no density normalization required.
- Primary interactions: click-to-edit, Enter commit, Escape/empty-value revert, per-entity removal, live count update, and Apply while an input is still active.
- Runtime checks: meaningful page content, no Next.js error overlay, and no page console errors.

## Fidelity review

- Typography: existing Studio family, size, weight, line height, and hierarchy are preserved.
- Spacing: section rhythm, chip height, radius, and wrapping match the source; the new `X` adds only compact horizontal space.
- Colors: existing foreground, tertiary text, glass-border, hover, primary, elevated, and overlay tokens are reused.
- Assets: existing Lucide icons are retained; no replacement raster or approximate asset was introduced.
- Copy: entity content and existing actions are preserved; new accessible labels are localized in Chinese and English.

## Findings and comparison history

- No actionable P0, P1, or P2 differences.
- Intentional difference: each chip includes the confirmed remove control and inline-edit focus treatment.
- Pass 1 found no blocking visual issue, so no post-comparison fix iteration was required.

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
---

# Studio 品牌区与剧本编辑器视觉验收

## 对比目标

- 品牌区视觉真相：`/var/folders/79/k_qqj6wx2sb92z55ktjwrvh40000gn/T/codex-clipboard-3bf8ef16-8b92-4a18-92c0-f4d04a7b69f6.png`（300 × 384 px）。
- 编辑器视觉真相：`/var/folders/79/k_qqj6wx2sb92z55ktjwrvh40000gn/T/codex-clipboard-ade4b15c-fbf2-4419-86f7-833e933959fa.png`（875 × 557 px）。
- 品牌区实现：`/tmp/croco-studio-brand-editor-qa/studio-brand-home-dark.png`（1280 × 720 px）。
- 项目流程实现：`/tmp/croco-studio-brand-editor-qa/project-pipeline-brand-light.png`（1280 × 720 px）。
- 编辑器最终实现：`/tmp/croco-studio-brand-editor-qa/script-editor-empty-dark-final.png`（1280 × 720 px）。
- 完整对比：`/tmp/croco-studio-brand-editor-qa/compare-brand.png`、`/tmp/croco-studio-brand-editor-qa/compare-editor.png`。
- 聚焦对比：`/tmp/croco-studio-brand-editor-qa/compare-brand-focus.png`、`/tmp/croco-studio-brand-editor-qa/compare-editor-focus-final.png`。

## 视口与状态

- 浏览器：Codex In-app Browser。
- CSS 视口：1280 × 720；`devicePixelRatio = 1`；截图像素与 CSS 像素 1:1，无密度缩放。
- 状态：中文；深色工作区、深色空白编辑器，以及亮色项目流程页。
- 路由：`#/`、`#/studio/editor`、`#/project/643b0fde-56b0-4a82-abbb-3fde89457fea`。
- 已验证交互：全局导航进入剧本编辑器、深浅主题切换、项目流程路由、CrocoTV 品牌链接目标、空白编辑器自动聚焦。
- 控制台：最终编辑器与项目流程页面均无 error。

## 五项保真检查

- 字体与排版：CrocoTV 字标复用 Canvas 的 16px/medium/紧凑字距；Studio 上下文、导航和路径继续使用现有 Canvas 兼容字体与字号 token。编辑器占位提示沿用剧本文字字体，层级低于正文。
- 间距与布局：CrocoTV 品牌固定在左上首行，主题切换同层；“视频工坊”和项目/系列路径统一放在下方。项目流程、工作区与编辑器的侧栏宽度和业务区域未改变。
- 色彩与 token：仅使用现有 `foreground`、`text-muted`、`hover-bg`、`primary` 等语义 token，深浅主题对比均正常。
- 图像与资产：CrocoTV 图标直接复制 Canvas 的 `web/public/favicon.png`，SHA-256 完全一致；未使用近似 SVG、CSS 图形或占位图。
- 文案：去除可见的 “LumenX” 与“返回 CrocoTV”按钮语义；空白编辑器中文提示为“从这里开始写剧本，或粘贴已有内容…”，英文同步为对应用户文案。

## Findings

- 无剩余 P0/P1/P2 问题。
- [P3] 光标闪烁相位不保证在静态截图中可见；运行态检查确认焦点元素为 `.ProseMirror-focused`，`caret-color` 使用主题 `primary`，编辑区最小高度为 432px。

## 对比迭代历史

1. 首轮聚焦对比发现空白编辑器的整列高亮线过强，可能被误认成模拟光标（P2）。
2. 删除容器级 `focus-within` 整列高亮，仅保留真实 ProseMirror 光标、可见占位提示和整列点击区域。
3. 重新构建并在同一 1280 × 720 深色状态捕获 `/tmp/croco-studio-brand-editor-qa/script-editor-empty-dark-final.png`；聚焦对比 `/tmp/croco-studio-brand-editor-qa/compare-editor-focus-final.png` 中已无整列高亮，运行态焦点和光标样式检查通过。

## Implementation Checklist

- [x] 全局、项目流程、系列和面包屑布局统一 CrocoTV 品牌层级。
- [x] 品牌点击目标保持为 CrocoTV Canvas 首页。
- [x] 空白可编辑文档进入编辑模式并自动获得真实编辑焦点。
- [x] 深浅主题、项目流程与编辑器空白态完成浏览器复验。
- [x] 最终页面无控制台错误。
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

---

# Canvas Studio Navigation — Design QA

## Evidence

- Source visual truth: `/var/folders/79/k_qqj6wx2sb92z55ktjwrvh40000gn/T/codex-clipboard-7e2601b2-0a45-44ca-a171-4b85271091a5.png`
- Browser-rendered implementation: `/tmp/canvas-studio-nav-full.png`
- Focused menu comparison: `/tmp/canvas-studio-nav-menu.png`
- Browser viewport: 1280 × 720 CSS px
- Density: devicePixelRatio 1; no density normalization required
- Source pixels: 258 × 343 (focused menu crop)
- Implementation pixels: 1280 × 720 full view; 236 × 391 focused menu crop
- State: dark theme, editable infinite canvas, navigation menu open
- Primary interaction tested: open canvas navigation; select “视频工坊”; arrive at `http://localhost:3010/`
- Console errors: none

## Findings

No actionable P0, P1, or P2 differences were found.

- Fonts and typography: existing menu family, size, weight, line height, and disabled-state hierarchy are preserved.
- Spacing and layout rhythm: the existing item spacing, divider rhythm, radius, and elevation are preserved. The menu is intentionally one row taller to accommodate the requested entry.
- Colors and visual tokens: dark surface, white foreground, muted disabled commands, and destructive red remain consistent with the source.
- Image quality and asset fidelity: no raster imagery is introduced. The new entry uses the same Lucide icon system as the surrounding menu.
- Copy and content: “视频工坊” appears directly below “我的画布” in both editable and read-only menu definitions.
- Interaction: the complete row is actionable and navigates in the current window to the configured Studio origin.

## Comparison Evidence

- Full view: the menu remains anchored beneath the upper-left navigation trigger without covering persistent canvas controls beyond the expected additional row height.
- Focused region: the new clapperboard icon and label align with the existing icon column and text baseline; dividers and all original actions remain unchanged.
- Comparison history: first pass passed; no P0/P1/P2 fixes or repeat capture were required.

## Implementation Checklist

- [x] Add the entry to editable canvas menus.
- [x] Add the entry to read-only canvas menus.
- [x] Reuse the configured Studio origin shared with the top navigation.
- [x] Verify the visible menu, navigation behavior, and browser console.

## Follow-up Polish

No P3 follow-up is required for this scoped change.

final result: passed

---

# Synchronized Character Supplements — Design QA

**Comparison Target**

- Source visual truth: `/var/folders/79/k_qqj6wx2sb92z55ktjwrvh40000gn/T/codex-clipboard-1f1d8176-35e1-4ac0-82d6-0ce7f9e80be3.png`
- Rendered implementation: `http://localhost:3014/#/library`
- Implementation screenshots: `/tmp/croco-character-asset-inspector.png`, `/tmp/croco-character-generation-modal.png`
- Combined comparison: `/tmp/croco-character-asset-inspector-comparison.png`
- Source pixels: 333 × 662. Implementation pixels and CSS viewport: 491 × 767 at device scale 1.
- Normalization: the source was proportionally scaled to 767 px high for the combined comparison; the implementation remained at its native capture size. The source shows a project character while the implementation shows a synchronized character with additional media, so comparison focuses on the shared inspector metadata and action hierarchy rather than differing media content.
- State: dark theme, asset library, synchronized-character inspector open and scrolled to the metadata/action region. The image-generation modal was also captured separately.

**Findings**

- No actionable P0, P1, or P2 differences remain.
- Fonts and typography: the existing display, body, and monospace hierarchy is preserved; button labels and metadata rows match the source weight and density.
- Spacing and layout rhythm: metadata rows, full-width primary action, secondary outlined actions, gaps, radii, and inspector padding remain consistent with the source. The added upload action uses the same established action stack.
- Colors and visual tokens: the implementation reuses the existing surface, border, muted-text, primary-action, and destructive-action tokens. No parallel visual language was introduced.
- Image and media fidelity: synchronized originals use the existing local files. Uploaded media remain single-copy resources and render in the existing image, video, and audio groups without placeholder artwork.
- Copy and content: the entry is now correctly labeled “上传资产”; its file input accepts `image/*,video/*,audio/*`. Image generation remains explicitly image-only.

**Full-view Comparison Evidence**

- The combined comparison confirms that the inspector retains the source's dark surface, metadata rhythm, prominent “生成更多变体” action, and stacked secondary actions.
- Intentional differences are the synchronized-character metadata, the additional “上传资产” action, and the local audio removal affordance required by the confirmed scope.

**Focused Region Evidence**

- `/tmp/croco-character-asset-inspector.png` verifies the metadata/action region, the local audio removal icon, and the “上传资产” label.
- `/tmp/croco-character-generation-modal.png` verifies the centered image-generation flow, reference images, prompt, model, aspect ratio, and count controls without expanding video/audio generation.

**Primary Interactions Tested**

- Opened a synchronized character from the library.
- Opened and closed the image-generation modal without starting a paid generation.
- Verified image-to-image mode and the no-reference text-to-image state.
- Verified uploaded video and audio resources appear in their existing media groups.
- Verified local media receive removal controls while synchronized originals remain protected.
- Verified the hidden file input accepts image, video, and audio media.
- Browser console warnings/errors checked: none.

**Comparison History**

- Initial pass found the synchronized-character cards still labeled “只读”. Fixed the card badge to “同步角色” and re-captured the implementation.
- Updated-scope pass found no remaining P0/P1/P2 visual mismatch after changing the upload entry to “上传资产” and adding local video/audio removal controls.

**Implementation Checklist**

- [x] Preserve existing inspector composition and visual tokens.
- [x] Support unified image, video, and audio upload.
- [x] Keep image generation image-only.
- [x] Protect synchronized source assets and allow local supplements to be detached.
- [x] Verify responsive narrow-panel rendering and browser console.

**Follow-up Polish**

- No blocking follow-up polish identified.

final result: passed

---

# Character Generation Task Cards — Design QA

**Evidence**

- Source inspector reference: `/var/folders/79/k_qqj6wx2sb92z55ktjwrvh40000gn/T/codex-clipboard-1f1d8176-35e1-4ac0-82d6-0ce7f9e80be3.png`
- Rendered implementation: `http://localhost:3014/#/library`
- Generation modal: `/tmp/croco-character-generation-task-modal.png`
- Compact result cards: `/tmp/croco-character-generation-result-cards.png`
- Side-by-side comparison: `/tmp/croco-character-generation-task-comparison.png`
- Browser viewport: 873 × 767 CSS px, dark theme, synchronized-character inspector.
- Validation reused an existing completed character generation in isolated preview data; no paid generation was started.

**Findings**

- No actionable P0, P1, or P2 visual differences remain.
- The modal preserves the existing creation-workbench controls while changing its primary action to task submission. Its supporting copy now explains that the dialog closes after task creation.
- The inspector uses the same glass surface, border, model tag, prompt hierarchy, image crop, and bottom-gradient toolbar language as Playground result cards, reduced to a two-column layout suitable for the 340 px panel.
- Completed outputs are independently actionable. Attached outputs receive a compact green check-only indicator in the top-left corner; the duplicate checked toolbar action is omitted.
- Pending/processing and failed task states use the existing status tokens and remain in the inspector after the modal closes.
- Upload, video, audio, metadata, primary-image, and download sections remain unchanged.

**Primary Interactions Tested**

- Opened a synchronized character with an existing completed image task.
- Verified three completed outputs render as independent compact cards.
- Verified already-associated resources show “已加入素材” and cannot be added twice.
- Opened and closed the image-generation modal without starting a paid generation.
- Verified the modal exposes “开始生成” and the automatic-close/task-tracking explanation.
- Verified the direct REST filter and idempotent confirmation endpoint.
- Verified the equivalent MCP list and confirmation tools.

**Implementation Checklist**

- [x] Close the modal after the server accepts a generation task.
- [x] Keep the modal open when task submission fails and allow manual closing while submitting.
- [x] Track pending, processing, failed, and completed tasks in the character inspector.
- [x] Confirm completed outputs one at a time before linking them to the character.
- [x] Reuse the existing compact completed-state check as a non-interactive status indicator.
- [x] Preserve single-copy resources and avoid automatic attachment.
- [x] Keep image generation image-only.

**Follow-up Polish**

- No blocking follow-up polish identified.

final result: passed
