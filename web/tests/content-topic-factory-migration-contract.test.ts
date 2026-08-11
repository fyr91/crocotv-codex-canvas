import assert from "node:assert/strict";
import fs from "node:fs";

const sql = fs.readFileSync(
    new URL("../../supabase/migrations/20260727090000_content_topic_factory_parallel_branches.sql", import.meta.url),
    "utf8",
);
const correction = fs.readFileSync(
    new URL("../../supabase/migrations/20260727042243_content_topic_factory_orientation_root.sql", import.meta.url),
    "utf8",
);
const scoreMigrationUrl = new URL(
    "../../supabase/migrations/20260727090001_content_topic_factory_minimum_score.sql",
    import.meta.url,
);
const scoreMigration = fs.existsSync(scoreMigrationUrl) ? fs.readFileSync(scoreMigrationUrl, "utf8") : "";
const nativeSourcesMigration = fs.readFileSync(
    new URL("../../supabase/migrations/20260727090002_topic_factory_native_sources_humanizer.sql", import.meta.url),
    "utf8",
);
const fullHumanizerMigration = fs.readFileSync(
    new URL("../../supabase/migrations/20260727090003_topic_factory_full_humanizer_prompt.sql", import.meta.url),
    "utf8",
);
const directionPromptMigration = fs.readFileSync(
    new URL("../../supabase/migrations/20260728120000_topic_factory_direction_sampling_and_visible_prompts.sql", import.meta.url),
    "utf8",
);
const flatGroundingMigrationUrl = new URL(
    "../../supabase/migrations/20260728111713_topic_factory_flat_grounding_output.sql",
    import.meta.url,
);
const flatGroundingMigration = fs.existsSync(flatGroundingMigrationUrl)
    ? fs.readFileSync(flatGroundingMigrationUrl, "utf8")
    : "";
const workflowMigrationUrl = new URL(
    "../../supabase/migrations/20260728060849_content_topic_branch_workflow.sql",
    import.meta.url,
);
const workflowMigration = fs.existsSync(workflowMigrationUrl) ? fs.readFileSync(workflowMigrationUrl, "utf8") : "";
const workboard = fs.readFileSync(
    new URL("../src/pages/content/workboard.tsx", import.meta.url),
    "utf8",
);
const treeNode = fs.readFileSync(
    new URL("../src/pages/content/components/content-tree-node.tsx", import.meta.url),
    "utf8",
);
const orientationForm = fs.readFileSync(
    new URL("../src/pages/content/components/topic-orientation-form.tsx", import.meta.url),
    "utf8",
);
const migrationsUrl = new URL("../../supabase/migrations/", import.meta.url);
const reviewContractMigrationName = fs.readdirSync(migrationsUrl)
    .find((name) => name.endsWith("_topic_review_explicit_output_contract.sql"));
const reviewContractMigration = reviewContractMigrationName
    ? fs.readFileSync(new URL(reviewContractMigrationName, migrationsUrl), "utf8")
    : "";
const startRootMigrationName = fs.readdirSync(migrationsUrl)
    .find((name) => name.endsWith("_content_topic_factory_topic_root_start.sql"));
const startRootMigration = startRootMigrationName
    ? fs.readFileSync(new URL(startRootMigrationName, migrationsUrl), "utf8")
    : "";
const latestStartFunction = startRootMigration.slice(
    startRootMigration.indexOf("function public.start_content_topic_factory_batch"),
    startRootMigration.indexOf("revoke all on function public.start_content_topic_factory_batch"),
);
const noticeGuardMigrationName = fs.readdirSync(migrationsUrl)
    .find((name) => name.endsWith("_content_topic_notice_trigger_table_guard.sql"));
const noticeGuardMigration = noticeGuardMigrationName
    ? fs.readFileSync(new URL(noticeGuardMigrationName, migrationsUrl), "utf8")
    : "";

assert.match(sql, /'topic_factory',\s*'2\.0\.0'/);
assert.match(sql, /gemini-3\.6-flash/);
assert.match(sql, /glm-5\.2/);
assert.match(sql, /for v_lane in 1\.\.5 loop/);
assert.match(sql, /start_content_topic_factory_batch/);
assert.match(sql, /result_node_id/);
assert.match(correction, /node_type\s*=\s*'orientation'/);
assert.match(correction, /regenerate_content_topic_factory/);
assert.match(correction, /with recursive descendants/);
assert.match(scoreMigration, /'topic_factory',\s*'2\.1\.0'/);
assert.match(scoreMigration, /大于或等于 85/);
assert.match(scoreMigration, /"minimumScore":85/);
assert.match(nativeSourcesMigration, /'humanizing'/);
assert.match(nativeSourcesMigration, /'topic_factory',\s*'2\.2\.0'/);
assert.match(nativeSourcesMigration, /output_schema\s*#-\s*'\{properties,source_refs\}'/);
assert.match(fullHumanizerMigration, /# Humanizer-zh: 去除 AI 写作痕迹/);
assert.match(fullHumanizerMigration, /## 完整示例/);
assert.match(fullHumanizerMigration, /main@91f3d394db8419c20d67ebe22a96cf8fee0a404b/);
assert.match(directionPromptMigration, /'topic_factory',\s*'3\.1\.0'/);
assert.match(directionPromptMigration, /topicDirections/);
assert.match(directionPromptMigration, /五个不重复的选题方向/);
assert.match(directionPromptMigration, /start_content_topic_factory_batch_base/);
assert.match(directionPromptMigration, /regenerate_content_topic_factory_base/);
assert.ok(flatGroundingMigration, "flat Grounding migration must exist");
assert.match(flatGroundingMigration, /'topic_factory',\s*'3\.2\.0'/);
assert.match(flatGroundingMigration, /'generate'/);
assert.match(flatGroundingMigration, /'review'/);
assert.match(flatGroundingMigration, /'humanize'/);
assert.match(flatGroundingMigration, /\$generate\$[\s\S]+角色[\s\S]+输出规范[\s\S]+\$generate\$/);
assert.match(flatGroundingMigration, /\$review\$[\s\S]+单次[\s\S]+candidate_output[\s\S]+\$review\$/);
assert.match(flatGroundingMigration, /\$humanize\$[\s\S]+语言[\s\S]+Grounding[\s\S]+\$humanize\$/);
assert.match(flatGroundingMigration, /grounding\[\]\.text/);
assert.match(flatGroundingMigration, /grounding\[\]\.source/);
assert.doesNotMatch(flatGroundingMigration, /btrim\(v_prompt\.system_prompt\)\s*\|\|/);
assert.doesNotMatch(flatGroundingMigration, /candidate_source_links/);
assert.doesNotMatch(flatGroundingMigration, /Challenge|第二次\s*Reviewer|第二个\s*Reviewer/);
assert.ok(reviewContractMigrationName, "explicit Topic Review output contract migration must exist");
assert.match(reviewContractMigration, /purpose_key\s*=\s*'review'/);
assert.match(reviewContractMigration, /verdict[\s\S]+total_score[\s\S]+dimension_scores[\s\S]+pass_reason[\s\S]+blocking_issues[\s\S]+revision_directions[\s\S]+critical_information/);
assert.match(reviewContractMigration, /audience_relevance[\s\S]+scenario_specificity[\s\S]+conflict_or_information_gap[\s\S]+payoff_fulfillment[\s\S]+credibility[\s\S]+ip_fit/);
assert.match(reviewContractMigration, /medical_health[\s\S]+safety[\s\S]+legal[\s\S]+financial[\s\S]+public_policy[\s\S]+scientific_statistical[\s\S]+other/);
assert.match(reviewContractMigration, /missing_source[\s\S]+possible_inaccuracy[\s\S]+source_conflict/);
assert.match(workflowMigration, /node_type\s*=\s*'topic'/);
assert.match(workflowMigration, /start_content_topic_factory_optimization/);
assert.match(workflowMigration, /p_client_request_id/);
assert.match(workflowMigration, /parent_id[^;]*p_source_node_id/s);
assert.match(workflowMigration, /notice_kind/);
assert.match(workflowMigration, /mark_content_node_notice_seen/);
assert.match(workflowMigration, /drop table public\.content_notifications/);
assert.match(workflowMigration, /notice_unread is distinct from/);
assert.ok(noticeGuardMigrationName, "content topic notice trigger guard migration must exist");
assert.match(noticeGuardMigration, /tg_table_name\s*=\s*'content_nodes'/, "notification-only updates must be checked only for content_nodes");
assert.match(noticeGuardMigration, /to_jsonb\(old\)->'notice_kind'/, "shared trigger must not access content_nodes-only record fields directly");
assert.doesNotMatch(workflowMigration, /insert into public\.content_notifications/);
assert.ok(startRootMigrationName, "Topic Factory Topic-root start migration must exist");
assert.match(latestStartFunction, /node_type\s*=\s*'topic'/, "Topic Factory start RPC must accept the Topic root node");
assert.match(latestStartFunction, /parent_id\s+is\s+null/, "Topic Factory start RPC must require the root Topic node");
assert.match(workboard, /rootNodeId:\s*root\.id/);
assert.match(workboard, /regenerateTopicFactory/);
assert.match(workboard, /optimizeTopicFactory/);
const generationHandler = workboard.slice(
    workboard.indexOf("const generateTopicBranches"),
    workboard.indexOf("async function regenerateFactory"),
);
assert.match(orientationForm, /if \(autosaveTimer\.current\) window\.clearTimeout\(autosaveTimer\.current\);\s*if \(onSubmit\) await onSubmit\(value\);\s*else await onSave\(value\);/);
assert.match(generationHandler, /runOptimisticTopicFactoryStart\(\{[\s\S]*save:\s*\(\)\s*=>\s*saveOrientation\(value\)/, "generation must publish placeholders before saving the root");
assert.doesNotMatch(workboard, /已覆盖并重新生成/, "regeneration should transition silently without a success toast");
assert.match(treeNode, /重新生成全部选题/);
assert.match(treeNode, /重新生成这个选题/);
assert.match(treeNode, /优化这个选题/);
assert.doesNotMatch(sql, /node_type[^;]*'batch'/s);
