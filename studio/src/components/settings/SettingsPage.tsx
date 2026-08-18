"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Box, Building, Check, Copy, Image, Layout, Loader2, Save, Trash2, User, Video } from "lucide-react";
import { useTranslations } from "next-intl";

import GroupedModelGrid from "@/components/common/GroupedModelGrid";
import ThemeToggle from "@/components/layout/ThemeToggle";
import { api, type PromptRegistryEntry, type ProviderSecretStatus } from "@/lib/api";
import {
  DEFAULT_MODEL_SETTINGS,
  GLOBAL_I2V_MODELS,
  GLOBAL_IMAGE_MODELS,
  GLOBAL_R2V_MODELS,
  normalizeModelSettings,
  type FrontendModelSettings,
} from "@/lib/modelCatalog";
import { ASPECT_RATIOS } from "@/store/projectStore";
import { useSettingsStore, type Locale } from "@/store/settingsStore";
import { toast } from "@/store/toastStore";
import { rovingKeyDown } from "@/lib/a11y";
import { FieldLabel, FormRow, ModeSegment, Toggle, settingsInputClass } from "./SettingsControls";
import GlobalPromptVersionModal from "./GlobalPromptVersionModal";

type SettingsCategory = "models" | "providers" | "advanced" | "about";

const APP_VERSION = "v0.1.0";
const APP_BUILD = "20260815";
const LS_KEY_MODEL = "lumenx_default_model_settings";
const LEGACY_PROMPT_STORAGE_KEY = "lumenx_default_prompt_config";

const PROVIDER_LABELS: Record<string, string> = {
  CODING_PLAN_API_KEY: "火山 Coding Plan",
  ARK_API_KEY: "火山方舟 Ark",
  BIGMODEL_API_KEY: "BigModel",
  RUNWARE_API_KEY: "Runware",
  GPU_API_TOKEN: "成都 GPU 调度中心",
  H3_API_KEY: "MiniMax H3",
  SUNO_API_KEY: "Suno",
  CROCO_CHARACTERS_API_TOKEN: "Croco 角色服务",
  DOUBAO_TTS_API_KEY: "豆包 TTS",
};

function loadModelSettings() {
  if (typeof window === "undefined") return DEFAULT_MODEL_SETTINGS;
  try {
    const raw = localStorage.getItem(LS_KEY_MODEL);
    return raw ? { ...DEFAULT_MODEL_SETTINGS, ...JSON.parse(raw) } : DEFAULT_MODEL_SETTINGS;
  } catch {
    return DEFAULT_MODEL_SETTINGS;
  }
}

function Section({ id, title, desc, children }: { id: string; title: string; desc?: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="glass-panel atelier-card rounded-2xl overflow-hidden">
      <div className="atelier-card-head px-[22px] pt-[18px] pb-3.5 border-b border-glass-border">
        <h2 id={`${id}-title`} className="font-display atelier-display text-xl font-medium text-foreground tracking-tight">
          {title}
        </h2>
        {desc && <p className="text-sm text-text-secondary mt-1 leading-relaxed">{desc}</p>}
      </div>
      <div className="px-[22px] pt-[18px] pb-[22px]">{children}</div>
    </section>
  );
}

export default function SettingsPage() {
  const t = useTranslations("settings");
  const { locale, animations, setLocale, setAnimations } = useSettingsStore();
  const [active, setActive] = useState<SettingsCategory>("models");
  const [modelSettings, setModelSettings] = useState<FrontendModelSettings>(() => normalizeModelSettings(loadModelSettings(), "global_settings"));
  const [providerSecrets, setProviderSecrets] = useState<ProviderSecretStatus[]>([]);
  const [secretDrafts, setSecretDrafts] = useState<Record<string, string>>({});
  const [providerLoading, setProviderLoading] = useState(true);
  const [providerError, setProviderError] = useState<string | null>(null);
  const [savingSecret, setSavingSecret] = useState<string | null>(null);
  const [copiedSecret, setCopiedSecret] = useState<string | null>(null);
  const [promptRegistry, setPromptRegistry] = useState<PromptRegistryEntry[]>([]);
  const [registryLoading, setRegistryLoading] = useState(true);
  const [registryError, setRegistryError] = useState<string | null>(null);
  const [selectedPromptKey, setSelectedPromptKey] = useState<string | null>(null);

  const refreshPromptRegistry = useCallback(async () => {
    setRegistryLoading(true);
    try {
      const registry = await api.getPromptRegistry();
      setPromptRegistry(registry.templates);
      setRegistryError(null);
    } catch {
      setRegistryError(t("registryLoadFailed"));
    } finally {
      setRegistryLoading(false);
    }
  }, [t]);

  const loadSharedSettings = useCallback(async () => {
    setProviderLoading(true);
    setRegistryLoading(true);
    const [secretsResult, registryResult] = await Promise.allSettled([
      api.getProviderSecrets(),
      api.getPromptRegistry(),
    ]);
    if (secretsResult.status === "fulfilled") {
      setProviderSecrets(secretsResult.value);
      setProviderError(null);
    } else {
      setProviderError(t("providerLoadFailed"));
    }
    if (registryResult.status === "fulfilled") {
      setPromptRegistry(registryResult.value.templates);
      setRegistryError(null);
    } else {
      setRegistryError(t("registryLoadFailed"));
    }
    setProviderLoading(false);
    setRegistryLoading(false);
  }, [t]);

  useEffect(() => {
    localStorage.removeItem(LEGACY_PROMPT_STORAGE_KEY);
    void loadSharedSettings();
  }, [loadSharedSettings]);

  const saveModelDefaults = () => {
    const normalized = normalizeModelSettings(modelSettings, "global_settings");
    const merged: FrontendModelSettings = {
      ...normalized,
      i2i_model: normalized.t2i_model,
      image_model: normalized.t2i_model,
    };
    localStorage.setItem(LS_KEY_MODEL, JSON.stringify(merged));
    setModelSettings(merged);
    toast.success(t("saved"));
  };

  const updateSecretStatus = (status: ProviderSecretStatus) => {
    setProviderSecrets((current) => current.map((item) => item.key === status.key ? status : item));
  };

  const saveSecret = async (key: string) => {
    const value = secretDrafts[key]?.trim();
    if (!value) {
      toast.error(t("providerEnterNewKey"));
      return;
    }
    setSavingSecret(key);
    try {
      updateSecretStatus(await api.updateProviderSecret(key, value));
      setSecretDrafts((current) => ({ ...current, [key]: "" }));
      toast.success(t("providerSaved"));
    } catch {
      toast.error(t("providerSaveFailed"));
    } finally {
      setSavingSecret(null);
    }
  };

  const copySecret = async (key: string) => {
    try {
      await api.copyProviderSecret(key);
      setCopiedSecret(key);
      window.setTimeout(() => setCopiedSecret((current) => current === key ? null : current), 1200);
      toast.success(t("copied"));
    } catch {
      toast.error(t("providerCopyFailed"));
    }
  };

  const clearSecret = async (key: string) => {
    if (!window.confirm(t("providerDeleteConfirm", { provider: PROVIDER_LABELS[key] || key }))) return;
    setSavingSecret(key);
    try {
      updateSecretStatus(await api.clearProviderSecret(key));
      setSecretDrafts((current) => ({ ...current, [key]: "" }));
      toast.success(t("providerDeleted"));
    } catch {
      toast.error(t("providerDeleteFailed"));
    } finally {
      setSavingSecret(null);
    }
  };

  const aspectButtons = (key: keyof FrontendModelSettings) => (
    <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={t("aspectRatioAria")} onKeyDown={rovingKeyDown}>
      {ASPECT_RATIOS.map((ratio) => {
        const selected = modelSettings[key] === ratio.id;
        return (
          <button
            key={ratio.id}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => setModelSettings((current) => ({ ...current, [key]: ratio.id }))}
            className={`flex flex-col items-center rounded-lg border px-2 py-2 text-sm font-medium transition-colors ${selected ? "border-primary bg-primary/10 text-foreground" : "border-glass-border bg-surface text-text-secondary hover:text-foreground"}`}
          >
            {ratio.name}
          </button>
        );
      })}
    </div>
  );

  const renderModels = () => (
    <Section id="models" title={t("secModelsTitle")} desc={t("secModelsDesc")}>
      <FormRow label={t("imageModelLabel")} hint={t("imageModelHint")}>
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
          <Image size={15} className="text-status-completed-fg" />
          <span>{t("imageModelCaption")}</span>
        </div>
        <GroupedModelGrid models={GLOBAL_IMAGE_MODELS} selectedId={modelSettings.t2i_model} onSelect={(id) => setModelSettings((current) => ({ ...current, t2i_model: id, i2i_model: id, image_model: id }))} />
      </FormRow>

      <FormRow label={t("assetAspectLabel")} hint={t("assetAspectHint")}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {([
            { key: "character_aspect_ratio" as const, label: t("assetCharacter"), icon: User },
            { key: "scene_aspect_ratio" as const, label: t("assetScene"), icon: Building },
            { key: "prop_aspect_ratio" as const, label: t("assetProp"), icon: Box },
          ]).map(({ key, label, icon: Icon }) => (
            <div key={key} className="space-y-2">
              <div className="flex items-center gap-1.5 text-sm text-text-secondary"><Icon size={13} />{label}</div>
              {aspectButtons(key)}
            </div>
          ))}
        </div>
      </FormRow>

      <FormRow label={t("storyboardAspectLabel")} hint={t("storyboardAspectHint")}>
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground"><Layout size={15} className="text-primary" />{t("storyboardAspectLabel")}</div>
        {aspectButtons("storyboard_aspect_ratio")}
      </FormRow>

      <FormRow label={t("i2vModelLabel")} hint={t("i2vModelHint")}>
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground"><Video size={15} className="text-primary" />{t("i2vModelLabel")}</div>
        <GroupedModelGrid models={GLOBAL_I2V_MODELS} selectedId={modelSettings.i2v_model} onSelect={(id) => setModelSettings((current) => ({ ...current, i2v_model: id }))} />
      </FormRow>

      <FormRow label={t("r2vModelLabel")} hint={t("r2vModelHint")}>
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground"><Video size={15} className="text-primary" />{t("r2vModelLabel")}</div>
        <GroupedModelGrid models={GLOBAL_R2V_MODELS} selectedId={modelSettings.r2v_model ?? ""} onSelect={(id) => setModelSettings((current) => ({ ...current, r2v_model: id }))} />
      </FormRow>

      <div className="flex justify-end pt-4">
        <button type="button" onClick={saveModelDefaults} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-accent transition-colors hover:bg-primary-hover">
          <Save size={16} />{t("saveDefaults")}
        </button>
      </div>
    </Section>
  );

  const renderProviders = () => (
    <Section id="providers" title={t("providersTitle")} desc={t("providersDesc")}>
      {providerLoading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-text-secondary"><Loader2 size={18} className="animate-spin" />{t("loadingConfig")}</div>
      ) : providerError ? (
        <div className="rounded-lg border border-status-failed-border bg-status-failed-bg p-4 text-sm text-status-failed-fg">{providerError}</div>
      ) : (
        <div className="space-y-5">
          {providerSecrets.map((secret) => (
            <div key={secret.key} className="rounded-xl border border-glass-border bg-surface p-4">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-medium text-foreground">{PROVIDER_LABELS[secret.key] || secret.key}</h3>
                  <p className="mt-1 font-mono text-sm text-text-muted">{secret.key}</p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-sm font-medium ${secret.configured ? "bg-status-completed-bg text-status-completed-fg" : "bg-hover-bg text-text-muted"}`}>
                  {secret.configured ? `${t("providerConfigured")} · ${secret.maskedValue}` : t("providerNotConfigured")}
                </span>
              </div>
              <FieldLabel>{t("providerNewKey")}</FieldLabel>
              <input
                type="password"
                value={secretDrafts[secret.key] || ""}
                onChange={(event) => setSecretDrafts((current) => ({ ...current, [secret.key]: event.target.value }))}
                placeholder={secret.configured ? t("providerKeepPlaceholder") : t("providerInputPlaceholder")}
                autoComplete="new-password"
                className={`${settingsInputClass} font-mono`}
              />
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                {secret.configured && (
                  <>
                    <button type="button" onClick={() => void copySecret(secret.key)} className="flex items-center gap-1.5 rounded-md border border-glass-border px-3 py-1.5 text-sm text-text-secondary transition-colors hover:text-foreground">
                      {copiedSecret === secret.key ? <Check size={14} className="text-status-completed-fg" /> : <Copy size={14} />}{t("copy")}
                    </button>
                    <button type="button" onClick={() => void clearSecret(secret.key)} disabled={savingSecret === secret.key} className="flex items-center gap-1.5 rounded-md border border-status-failed-border px-3 py-1.5 text-sm text-status-failed-fg transition-colors hover:bg-status-failed-bg disabled:opacity-50">
                      <Trash2 size={14} />{t("providerDelete")}
                    </button>
                  </>
                )}
                <button type="button" onClick={() => void saveSecret(secret.key)} disabled={savingSecret === secret.key} className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-on-accent transition-colors hover:bg-primary-hover disabled:opacity-50">
                  {savingSecret === secret.key ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}{t("providerSave")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
  );

  const renderAdvanced = () => (
    <div className="flex flex-col gap-6">
      <Section id="interface" title={t("advancedInterfaceTitle")} desc={t("advancedInterfaceDesc")}>
        <Toggle checked={animations} onChange={setAnimations} label={animations ? t("motionOn") : t("motionReduced")} sub={t("motionSub")} ariaLabel={t("motionToggleAria")} />
      </Section>
      <Section id="prompt-registry" title={t("registryTitle")} desc={t("registryDesc")}>
        {registryLoading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-text-secondary"><Loader2 size={18} className="animate-spin" />{t("registryLoading")}</div>
        ) : registryError ? (
          <div className="rounded-lg border border-status-failed-border bg-status-failed-bg p-4 text-sm text-status-failed-fg">{registryError}</div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-glass-border">
            {promptRegistry.map((template) => (
              <button type="button" key={`${template.templateKey}@${template.templateVersion}`} onClick={() => setSelectedPromptKey(template.templateKey)} className="grid w-full gap-2 border-b border-glass-border px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-hover-bg md:grid-cols-[1fr_auto] md:items-center">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-foreground">{template.title}</div>
                  <div className="mt-1 truncate font-mono text-sm text-text-muted">{template.templateKey}</div>
                </div>
                <div className="flex items-center gap-2 text-sm text-text-secondary">
                  <span>{template.stage}</span>
                  <span className="rounded-full bg-hover-bg px-2 py-1 font-mono">v{template.templateVersion}</span>
                  <span className="rounded-full bg-status-completed-bg px-2 py-1 text-status-completed-fg">{t("registryActive")}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </Section>
      <GlobalPromptVersionModal templateKey={selectedPromptKey} onClose={() => setSelectedPromptKey(null)} onChanged={() => void refreshPromptRegistry()} />
    </div>
  );

  const renderAbout = () => (
    <Section id="about" title={t("aboutVideoWorkshop")}>
      <div className="space-y-0">
        {[
          [t("aboutProduct"), t("aboutVideoWorkshop")],
          [t("aboutAppVersion"), APP_VERSION],
          [t("aboutBuild"), APP_BUILD],
        ].map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-4 border-b border-glass-border py-3 text-sm last:border-b-0">
            <span className="text-text-secondary">{label}</span>
            <span className="font-mono text-foreground">{value}</span>
          </div>
        ))}
      </div>
      <div className="mt-6 rounded-xl border border-glass-border bg-surface p-4">
        <div className="text-sm font-medium text-foreground">{t("updateLabel")}</div>
        <p className="mt-1 text-sm text-text-muted">{t("aboutUpdatePlaceholder")}</p>
      </div>
    </Section>
  );

  const tabs: Array<{ id: SettingsCategory; label: string }> = [
    { id: "models", label: t("tabModels") },
    { id: "providers", label: t("tabProviders") },
    { id: "advanced", label: t("tabAdvanced") },
    { id: "about", label: t("tabAbout") },
  ];

  const content = active === "models" ? renderModels() : active === "providers" ? renderProviders() : active === "advanced" ? renderAdvanced() : renderAbout();

  return (
    <div className="relative flex h-full flex-col">
      <div className="atelier-page-bloom" aria-hidden="true" />
      <div className="atelier-page-grain" aria-hidden="true" />
      <header className="relative z-10 flex-shrink-0 border-b border-glass-border px-4 pb-4 pt-5 md:px-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="font-mono text-sm font-medium uppercase tracking-[0.2em] text-text-muted">{t("title")}</div>
            <h1 className="font-display atelier-display mt-2 text-[2rem] font-medium leading-[1.15] tracking-[-0.025em] text-foreground md:text-[2.25rem]">{t("title")}</h1>
          </div>
          <div className="flex items-center gap-2" aria-label={t("appearance")}>
            <ModeSegment value={locale} onChange={(value) => setLocale(value as Locale)} options={[{ id: "zh", label: t("chinese") }, { id: "en", label: t("english") }]} />
            <ThemeToggle />
          </div>
        </div>
        <nav className="mt-5 flex flex-wrap gap-1" role="tablist" aria-label={t("tabsAria")} onKeyDown={rovingKeyDown}>
          {tabs.map((tab) => {
            const selected = tab.id === active;
            return (
              <button key={tab.id} type="button" role="tab" aria-selected={selected} tabIndex={selected ? 0 : -1} onClick={() => setActive(tab.id)} className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${selected ? "bg-primary/10 text-foreground" : "text-text-muted hover:bg-hover-bg hover:text-foreground"}`}>
                {tab.label}
              </button>
            );
          })}
        </nav>
      </header>
      <div className="relative z-10 flex-1 overflow-y-auto px-4 py-8 md:px-10">
        <div className="mx-auto flex max-w-6xl flex-col gap-6">{content}<div className="pb-8" /></div>
      </div>
    </div>
  );
}
