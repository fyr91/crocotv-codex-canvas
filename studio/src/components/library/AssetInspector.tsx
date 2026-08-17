"use client";

import { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { X, Star, Download, Sparkles, Loader2 } from "lucide-react";
import type { Character, Scene, Prop, ImageAsset, ImageVariant } from "@/store/projectStore";
import { characterImageAsset } from "@/lib/characterImage";
import { api } from "@/lib/api";
import { toast } from "@/store/toastStore";
import { coverGradient, GRAIN_URL } from "@/lib/atelierCover";
import { isPulledCharacterAsset } from "@/lib/pulledCharacterAssets";

type AssetTab = "characters" | "scenes" | "props";

// 资产类型 → 后端单数 type（生成端点用）。
const SINGULAR_TYPE: Record<AssetTab, string> = {
  characters: "character",
  scenes: "scene",
  props: "prop",
};

// 「生成更多变体」一次追加的张数 + 任务轮询参数（~5 分钟上限）。
const VARIANT_BATCH = 3;
const POLL_INTERVAL_MS = 2000;
const POLL_MAX_ATTEMPTS = 150;

interface AssetInspectorProps {
  asset: Character | Scene | Prop;
  type: AssetTab;
  sourceName: string;
  /** 裸 series/project id（调生成/刷新 API 用）。 */
  sourceId: string;
  /** 同步角色库只读；系列资产无生成端点；独立项目和剧集资产均走项目生成端点。 */
  sourceKind: "series" | "project" | "episode" | "character-library";
  starred: boolean;
  onClose: () => void;
  onToggleStar: () => void;
}

/** Character 走 characterImageAsset（reference_sheet→full_body，归一化成 ImageAsset 形状）；scene/prop 用 image_asset。 */
function primaryImageAsset(asset: Character | Scene | Prop, type: AssetTab): ImageAsset | undefined {
  if (type === "characters") return characterImageAsset(asset as Character);
  return (asset as Scene | Prop).image_asset;
}

function fallbackUrl(asset: Character | Scene | Prop, type: AssetTab): string | undefined {
  if (type === "characters") {
    const c = asset as Character;
    return c.image_url || c.full_body_image_url;
  }
  return (asset as Scene | Prop).image_url;
}

const MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/svg+xml": "svg",
};

/** 下载文件名扩展名：优先取 URL 路径后缀（剥掉 query/签名），否则回退到 blob content-type，默认 png。 */
function downloadExt(url: string, contentType?: string): string {
  try {
    const path = new URL(url, window.location.origin).pathname;
    const m = path.match(/\.([a-z0-9]+)$/i);
    if (m) return m[1].toLowerCase();
  } catch {
    // URL 解析失败时退回 content-type / 默认
  }
  const fromType = contentType?.split(";")[0].trim().toLowerCase();
  if (fromType && MIME_EXT[fromType]) return MIME_EXT[fromType];
  return "png";
}

/**
 * 资产库右侧详情抽屉（Line B "Luminous Atelier"）。
 * 库专用，不复用共享 AssetCard。展示选中资产的 hero + 变体条 + 元数据 + prompt + 动作。
 * 元数据数据驱动（metaRows）：SEED/MODEL/SIZE 当前数据模型未存（变体仅
 * id/url/created_at/prompt_used），故读为 undefined → 不渲染；后端补字段后 UI 零改自动出现。
 * 动作区：「下载」实做；「生成更多变体」对 project 资产实做（series 置灰，无生成端点）。
 */
export default function AssetInspector({
  asset,
  type,
  sourceName,
  sourceId,
  sourceKind,
  starred,
  onClose,
  onToggleStar,
}: AssetInspectorProps) {
  const t = useTranslations("library");
  const pulledCharacter = isPulledCharacterAsset(asset) ? asset : undefined;
  const pulledResources = pulledCharacter?.pulled_resources ?? [];
  const pulledVideos = pulledResources.filter((resource) => resource.type === "video");
  const pulledAudio = pulledResources.filter((resource) => resource.type === "audio");
  const TYPE_LABEL: Record<AssetTab, string> = {
    characters: t("characterLabel"),
    scenes: t("sceneLabel"),
    props: t("propLabel"),
  };
  // created_at 来自 time.time()（秒）；容错已是毫秒的情况。相对时间标签走 i18n。
  const timeAgo = (ts?: number): string => {
    if (!ts) return "—";
    const tsMs = ts > 1e12 ? ts : ts * 1000;
    const days = Math.floor((Date.now() - tsMs) / 86_400_000);
    if (days <= 0) return t("timeToday");
    if (days === 1) return t("timeYesterday");
    if (days < 30) return t("timeDaysAgo", { days });
    return t("timeMonthsAgo", { months: Math.floor(days / 30) });
  };
  const imageAsset = primaryImageAsset(asset, type);
  const baseVariants = imageAsset?.variants ?? [];
  // 本地新生成的变体（来自「生成更多变体」）。父层 library 自己持有 `sources` 且只在整页
  // reload 时刷新，所以新变体在此并入以即时反馈；按 id 与 prop 集去重，父层后续 reload
  // （届时新变体会随 `baseVariants` 带回）也不会重复。
  const [extraVariants, setExtraVariants] = useState<ImageVariant[]>([]);
  const baseIds = new Set(baseVariants.map((v) => v.id));
  const variants = [...baseVariants, ...extraVariants.filter((v) => !baseIds.has(v.id))];
  const defaultId = imageAsset?.selected_id ?? baseVariants[0]?.id ?? null;
  const [activeVariantId, setActiveVariantId] = useState<string | null>(defaultId);
  const [generating, setGenerating] = useState(false);

  // 切换选中资产时重置本地高亮的变体 + 丢弃上一个资产本地追加的变体。
  useEffect(() => {
    setActiveVariantId(defaultId);
    setExtraVariants([]);
  }, [asset.id, defaultId]);

  // 卸载/切换资产后避免异步轮询回写已失效的状态。
  const aliveRef = useRef(true);
  const currentAssetIdRef = useRef(asset.id);
  useEffect(() => {
    currentAssetIdRef.current = asset.id;
  }, [asset.id]);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  // a11y：抽屉打开时把焦点移入面板、Escape 关闭、关闭后还原焦点（非模态，不做 focus trap）。
  const asideRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    asideRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, []);

  const activeVariant = variants.find((v) => v.id === activeVariantId) ?? variants[0];
  const heroUrl = activeVariant?.url ?? fallbackUrl(asset, type);
  const prompt = activeVariant?.prompt_used ?? "";

  // 元数据行（数据驱动）：先放现有四项，再在字段存在时追加 SEED/MODEL/SIZE。
  // 后端 TODO：当前 ImageVariant 仅 id/url/created_at/prompt_used，资产无 seed/model/size，
  // 故 assetMeta.* 读为 undefined → 不 push → 不渲染。后端补字段后此处零改自动出现。
  const assetMeta = asset as Partial<{ seed: number | string; model: string; size: string }>;
  const metaRows: { label: string; value: string }[] = [
    { label: t("metaType"), value: TYPE_LABEL[type] },
    { label: t("metaSource"), value: sourceName },
    {
      label: pulledCharacter ? t("metaResource") : t("metaVariant"),
      value: `${pulledCharacter ? pulledResources.length : variants.length}`,
    },
    { label: t("metaCreated"), value: timeAgo(activeVariant?.created_at) },
  ];
  if (pulledCharacter?.english_name) {
    metaRows.push({ label: t("metaEnglishName"), value: pulledCharacter.english_name });
  }
  if (pulledCharacter?.voice_id) {
    metaRows.push({ label: t("metaVoiceId"), value: pulledCharacter.voice_id });
  }
  if (assetMeta.seed != null) metaRows.push({ label: "SEED", value: String(assetMeta.seed) });
  if (assetMeta.model) metaRows.push({ label: "MODEL", value: assetMeta.model });
  if (assetMeta.size) metaRows.push({ label: "SIZE", value: assetMeta.size });

  const handleDownload = async () => {
    if (!heroUrl) return;
    const fileBase = asset.name || "asset";
    try {
      const res = await fetch(heroUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const ext = downloadExt(heroUrl, blob.type);
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `${fileBase}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      // 跨域(CORS)/网络失败：download 属性对跨域 URL 无效，退回到新标签打开。
      window.open(heroUrl, "_blank", "noopener,noreferrer");
    }
  };

  // 轮询生成任务直到完成（mirror ConsistencyVault 的 task 轮询）；失败/超时抛错。
  const pollUntilDone = async (taskId: string): Promise<boolean> => {
    for (let i = 0; i < POLL_MAX_ATTEMPTS; i++) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      if (!aliveRef.current) return false;
      let status: { status?: string; error?: string } | undefined;
      try {
        status = await api.getTaskStatus(taskId);
      } catch {
        continue; // 瞬时网络错误：继续轮询
      }
      if (status?.status === "completed") return true;
      if (status?.status === "failed") throw new Error(status.error || t("genFailed"));
    }
    throw new Error(t("genTimeout"));
  };

  // 生成更多变体：独立项目和剧集资产可用（series 无生成端点）。复用按项目 batch 生成管线，
  // 完成后 re-fetch 该项目，把新变体并入本地展示并高亮最新一张。
  const handleGenerateVariants = async () => {
    if (sourceKind === "series" || sourceKind === "character-library" || generating) return;
    const assetId = asset.id;
    const projectId = sourceId;
    setGenerating(true);
    const tid = toast.progress(t("generatingVariants"), {
      body: t("generatingVariantsBody", { name: asset.name, count: VARIANT_BATCH }),
    });
    try {
      const resp = await api.generateAsset(
        projectId,
        assetId,
        SINGULAR_TYPE[type],
        "",
        undefined,
        "all",
        "",
        true,
        "",
        VARIANT_BATCH
      );
      const taskId = (resp as { _task_id?: string } | undefined)?._task_id;
      if (taskId) {
        const done = await pollUntilDone(taskId);
        if (!done) return; // 已卸载
      }
      if (!aliveRef.current || currentAssetIdRef.current !== assetId) return;
      const proj = await api.getProject(projectId);
      const list: (Character | Scene | Prop)[] =
        (type === "characters" ? proj?.characters : type === "scenes" ? proj?.scenes : proj?.props) ?? [];
      const updated = list.find((a) => a.id === assetId);
      const freshVariants = (updated ? primaryImageAsset(updated, type)?.variants : undefined) ?? [];
      if (!aliveRef.current || currentAssetIdRef.current !== assetId) return;
      const added = freshVariants.filter((v) => !baseIds.has(v.id));
      setExtraVariants(freshVariants);
      if (added[0]) setActiveVariantId(added[0].id);
      toast.update(tid, {
        kind: "success",
        title: t("variantsGenerated"),
        body: added.length ? t("variantsAddedBody", { count: added.length }) : t("variantsRefreshed"),
        autoCloseMs: 5000,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : t("genFailed");
      if (aliveRef.current) toast.update(tid, { kind: "error", title: t("variantsGenFailed"), body: msg, autoCloseMs: 0 });
    } finally {
      if (aliveRef.current) setGenerating(false);
    }
  };

  return (
    <aside
      ref={asideRef}
      tabIndex={-1}
      className="fixed inset-0 z-50 w-full md:static md:inset-auto md:z-auto md:w-[340px] flex-shrink-0 h-full flex flex-col overflow-y-auto bg-surface border-l border-glass-border shadow-2xl atelier-reveal focus:outline-none"
      aria-label={t("inspectorAria")}
    >
      {/* Hero — 磨砂铺底 + object-contain：三视图/横竖混杂的资产完整展示不裁切（避免裁头）。 */}
      <div className="relative aspect-[3/4] bg-surface-inset overflow-hidden flex-shrink-0">
        {heroUrl ? (
          <>
            <img
              src={heroUrl}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 w-full h-full object-cover blur-xl scale-110 opacity-40"
            />
            <img src={heroUrl} alt={asset.name} className="relative w-full h-full object-contain" />
          </>
        ) : (
          // 无图像：确定性渐变封面 + 颗粒，替代发灰占位图标。
          <>
            <div className="absolute inset-0" style={{ background: coverGradient(asset.id) }} aria-hidden="true" />
            <div
              className="absolute inset-0 mix-blend-overlay opacity-60"
              style={{ backgroundImage: GRAIN_URL }}
              aria-hidden="true"
            />
            <div className="relative w-full h-full grid place-items-center p-6 text-center">
              <span className="font-display atelier-display text-xl font-medium text-foreground tracking-tight">
                {asset.name}
              </span>
            </div>
          </>
        )}
        {/* amber halation overlay — only on starred (atelier signature; amber = starred). */}
        {starred && (
          <div
            className="pointer-events-none absolute inset-0 shadow-none"
            aria-hidden="true"
          />
        )}
        {pulledCharacter ? (
          <span className="absolute top-3 left-3 inline-flex items-center px-3 py-1.5 rounded-full font-mono text-sm font-medium uppercase tracking-[0.1em] text-white bg-black/50 backdrop-blur-md border border-white/10">
            {t("readOnlyBadge")}
          </span>
        ) : (
          <button
            type="button"
            onClick={onToggleStar}
            aria-pressed={starred}
            aria-label={starred ? t("unstar") : t("star")}
            className={`absolute top-3 left-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-mono text-sm font-medium uppercase tracking-[0.1em] backdrop-blur-md border transition-colors ${
              starred
                ? "text-status-starred-fg bg-status-starred-bg border-status-starred-border"
                : "text-text-secondary bg-black/40 border-transparent hover:text-foreground"
            }`}
          >
            <Star size={12} className={starred ? "fill-current" : ""} />
            {starred ? t("starred") : t("star")}
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label={t("closeInspector")}
          className="absolute top-3 right-3 w-8 h-8 rounded-full grid place-items-center bg-black/50 backdrop-blur-md text-foreground hover:bg-black/70 transition-colors"
        >
          <X size={15} />
        </button>
      </div>

      <div className="p-5 flex flex-col gap-5">
        <div>
          <div className="font-display atelier-display text-xl font-medium text-foreground tracking-tight">
            {asset.name}
          </div>
          <div className="font-mono text-sm text-text-muted tracking-[0.06em] uppercase mt-1.5">
            {TYPE_LABEL[type]} · {sourceName} · {pulledCharacter
              ? t("resourceCount", { count: pulledResources.length })
              : t("variantCount", { count: variants.length })}
          </div>
        </div>

        {/* Variant strip */}
        {variants.length > (pulledCharacter ? 0 : 1) && (
          <div>
            <div className="font-mono text-sm font-medium uppercase tracking-[0.16em] text-text-secondary mb-2.5">
              {pulledCharacter ? t("imagesSection", { count: variants.length }) : t("variantsSection")}
            </div>
            <div className="grid grid-cols-4 gap-2">
              {variants.map((v) => {
                const on = v.id === activeVariant?.id;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setActiveVariantId(v.id)}
                    aria-current={on ? "true" : undefined}
                    className={`relative aspect-square rounded-md overflow-hidden transition-transform hover:-translate-y-0.5 ${
                      on ? "ring-2 ring-primary" : "ring-1 ring-glass-border"
                    }`}
                  >
                    <img src={v.url} alt={t("variantAlt")} className="w-full h-full object-cover" />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {pulledVideos.length > 0 && (
          <div>
            <div className="font-mono text-sm font-medium uppercase tracking-[0.16em] text-text-secondary mb-2.5">
              {t("videosSection", { count: pulledVideos.length })}
            </div>
            <div className="flex flex-col gap-2.5">
              {pulledVideos.map((resource) => (
                <div key={resource.id} className="rounded-lg overflow-hidden border border-glass-border bg-surface-inset">
                  <video
                    src={resource.url}
                    controls
                    preload="none"
                    className="w-full aspect-video bg-black object-contain"
                    aria-label={resource.name}
                  />
                  <div className="px-3 py-2 text-sm text-text-secondary truncate">{resource.name}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {pulledAudio.length > 0 && (
          <div>
            <div className="font-mono text-sm font-medium uppercase tracking-[0.16em] text-text-secondary mb-2.5">
              {t("audioSection", { count: pulledAudio.length })}
            </div>
            <div className="flex flex-col gap-2.5">
              {pulledAudio.map((resource) => (
                <div key={resource.id} className="rounded-lg border border-glass-border bg-surface-inset px-3 py-2.5">
                  <div className="text-sm text-text-secondary truncate mb-2">{resource.name}</div>
                  <audio src={resource.url} controls preload="none" className="w-full h-8" aria-label={resource.name} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Metadata */}
        <div>
          <div className="font-mono text-sm font-medium uppercase tracking-[0.16em] text-text-secondary mb-2.5">
            {t("metadataSection")}
          </div>
          <div className="flex flex-col">
            {metaRows.map((row) => (
              <div
                key={row.label}
                className="flex justify-between items-center py-2 border-b border-glass-border last:border-b-0 text-sm"
              >
                <span className="font-mono text-sm text-text-muted tracking-[0.04em]">{row.label}</span>
                <span className="text-foreground font-medium">{row.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Prompt */}
        {prompt && (
          <div>
            <div className="font-mono text-sm font-medium uppercase tracking-[0.16em] text-text-secondary mb-2.5">
              {t("promptSection")}
            </div>
            <div className="bg-surface-inset rounded-lg p-3.5 text-sm leading-relaxed text-text-secondary border-l-2 border-status-starred-border">
              {prompt}
            </div>
          </div>
        )}

        {/* Actions */}
        {/*
          生成更多变体：project 资产复用「按项目 batch 生成」管线，对当前 asset append 新变体
          （不替换），完成后并入本地展示并高亮最新一张；series 资产无生成端点（生成需在具体
          项目内进行），故置灰并提示在剧集内生成。「用于分镜」按钮已移除（占位、无落地路径）。
        */}
        <div className="flex flex-col gap-2">
          {sourceKind === "character-library" ? (
            <div className="rounded-lg border border-glass-border bg-surface-inset px-3.5 py-3 text-sm leading-relaxed text-text-secondary">
              {t("readOnlyHint")}
            </div>
          ) : sourceKind !== "series" ? (
            <button
              type="button"
              onClick={handleGenerateVariants}
              disabled={generating}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-on-accent text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {generating ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
              {generating ? t("generating") : t("generateMoreVariants")}
            </button>
          ) : (
            <button
              type="button"
              disabled
              title={t("genInEpisodeTooltip")}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-surface-inset border border-glass-border text-text-muted text-sm font-medium cursor-not-allowed disabled:opacity-60"
            >
              <Sparkles size={15} />
              {t("generateMoreVariants")}
              <span className="inline-flex items-center rounded-full px-1.5 py-0.5 font-mono text-sm font-medium tracking-[0.06em] text-status-pending-fg bg-status-pending-bg border border-status-pending-border">
                {t("genInEpisodeBadge")}
              </span>
            </button>
          )}
          {/* 下载：v1 实做 */}
          <button
            type="button"
            onClick={handleDownload}
            disabled={!heroUrl}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-surface-inset border border-glass-border text-foreground text-sm font-medium hover:bg-hover-bg transition-colors disabled:opacity-40"
          >
            <Download size={15} />
            {t("download")}
          </button>
        </div>
      </div>
    </aside>
  );
}
