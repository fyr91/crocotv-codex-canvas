---
name: minimax-video-prompt-optimizer
description: Optimize MiniMax H3 视频提示词 with one universal Ref2VA six-section structure across text, keyframe, and full-reference inputs. Use when the user asks for MiniMax 视频提示词优化、H3 提词优化、多模态提示词改写、关键帧对齐，或定义 image、video、audio reference labels.
---

# H3 Prompt Writing

## Workflow

1. Read `references/ref-en.txt` and always use its Ref2VA six-section rewrite format.
2. Inspect supplied text, first/last frames, images, videos, and audio only to determine stable reference roles and timeline constraints; do not use them to select another System Prompt or output schema.
3. Read `references/base-en.txt` only when detailed camera, speaker, dialogue-across-cut, or keyframe-path examples are needed; never copy its three-field output structure.
4. Preserve the universal field names, section order, stable labels, and timing notation.

## Universal Structure

Every task returns, in order:

- `subject_definitions`
- `summary`
- `retention_analysis`
- `detailed_description`
- `overall_soundscape`
- `non_diegetic_music`

Reference labels stay consistent across all sections. A task without a particular media kind omits invented references rather than switching formats.

## Output Rules

- Write rewrite sections in English; preserve dialogue, lyrics, and visible scene text in their original language.
- Describe each shot by composition, subjects, environment, actions, camera, sound, and the exact point where referenced content appears.
- Avoid plot summaries, unresolved reference labels, and timing that does not match the requested duration.
