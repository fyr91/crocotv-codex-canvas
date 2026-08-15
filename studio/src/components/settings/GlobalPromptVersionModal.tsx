"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, GitBranch, History, Loader2, Save, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { api, type PromptRegistryEntry, type PromptTemplateDetail } from "@/lib/api";
import { toast } from "@/store/toastStore";

type Props = {
  templateKey: string | null;
  onClose: () => void;
  onChanged: () => void;
};

export default function GlobalPromptVersionModal({ templateKey, onClose, onChanged }: Props) {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const [versions, setVersions] = useState<PromptRegistryEntry[]>([]);
  const [selectedVersion, setSelectedVersion] = useState("");
  const [detail, setDetail] = useState<PromptTemplateDetail | null>(null);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadVersions = useCallback(async (preferredVersion?: string) => {
    if (!templateKey) return;
    setLoading(true);
    try {
      const registry = await api.getPromptRegistry(true);
      const available = registry.templates.filter((item) => item.templateKey === templateKey).sort((left, right) => right.templateVersion.localeCompare(left.templateVersion, undefined, { numeric: true }));
      const target = preferredVersion || available.find((item) => item.active)?.templateVersion || available[0]?.templateVersion || "";
      setVersions(available);
      setSelectedVersion(target);
      const nextDetail = target ? await api.getPromptTemplate(templateKey, target) : null;
      setDetail(nextDetail);
      setDraft(nextDetail?.systemPrompt || "");
      setEditing(false);
    } catch {
      toast.error(t("registryLoadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t, templateKey]);

  useEffect(() => {
    if (templateKey) void loadVersions();
  }, [loadVersions, templateKey]);

  useEffect(() => {
    if (!templateKey) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, templateKey]);

  const chooseVersion = async (version: string) => {
    if (!templateKey || version === selectedVersion) return;
    setSelectedVersion(version);
    setLoading(true);
    try {
      const nextDetail = await api.getPromptTemplate(templateKey, version);
      setDetail(nextDetail);
      setDraft(nextDetail.systemPrompt);
      setEditing(false);
    } catch {
      toast.error(t("registryLoadFailed"));
    } finally {
      setLoading(false);
    }
  };

  const saveVersion = async (activate: boolean) => {
    if (!templateKey || !detail || !draft.trim()) return;
    setSaving(true);
    try {
      const created = await api.createGlobalPromptVersion(templateKey, { baseVersion: detail.templateVersion, systemPrompt: draft, activate });
      toast.success(activate ? t("promptSavedActivated") : t("promptVersionSaved"));
      onChanged();
      await loadVersions(created.templateVersion);
    } catch {
      toast.error(t("promptVersionSaveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const activateVersion = async () => {
    if (!templateKey || !detail || detail.active) return;
    if (!window.confirm(t("promptActivateConfirm", { version: detail.templateVersion }))) return;
    setSaving(true);
    try {
      await api.activateGlobalPromptVersion(templateKey, detail.templateVersion);
      toast.success(t("promptVersionActivated"));
      onChanged();
      await loadVersions(detail.templateVersion);
    } catch {
      toast.error(t("promptVersionActivateFailed"));
    } finally {
      setSaving(false);
    }
  };

  if (!templateKey) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-overlay p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="global-prompt-title" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-glass-border bg-elevated shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-glass-border px-6 py-5">
          <div>
            <div className="mb-1 flex items-center gap-2 text-sm text-text-muted"><GitBranch size={14} />{templateKey}</div>
            <h2 id="global-prompt-title" className="text-xl font-medium text-foreground">{detail?.title || t("registryTitle")}</h2>
            <p className="mt-1 text-sm text-text-secondary">{t("promptImmutableHint")}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-text-secondary transition-colors hover:bg-hover-bg hover:text-foreground" aria-label={tc("close")}><X size={18} /></button>
        </header>

        <div className="grid min-h-0 flex-1 md:grid-cols-[250px_1fr]">
          <aside className="overflow-y-auto border-b border-glass-border p-4 md:border-b-0 md:border-r">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground"><History size={15} />{t("promptVersionHistory")}</div>
            <div className="space-y-2">
              {versions.map((version) => (
                <button key={version.templateVersion} type="button" onClick={() => void chooseVersion(version.templateVersion)} className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${selectedVersion === version.templateVersion ? "border-primary bg-primary/10" : "border-glass-border hover:bg-hover-bg"}`}>
                  <div className="flex items-center justify-between gap-2 text-sm font-medium text-foreground"><span>v{version.templateVersion}</span>{version.active ? <span className="rounded-full bg-status-completed-bg px-2 py-0.5 text-sm text-status-completed-fg">{t("registryActive")}</span> : null}</div>
                  <div className="mt-1 text-sm text-text-muted">{version.source === "local-global" ? t("promptSourceLocal") : t("promptSourceBuiltin")}</div>
                </button>
              ))}
            </div>
          </aside>

          <section className="min-h-0 overflow-y-auto p-6">
            {loading || !detail ? (
              <div className="flex min-h-72 items-center justify-center gap-2 text-sm text-text-secondary"><Loader2 size={18} className="animate-spin" />{t("registryLoading")}</div>
            ) : (
              <div className="space-y-5">
                <div className="grid gap-3 md:grid-cols-3">
                  <Meta label={t("promptVersionLabel")} value={`v${detail.templateVersion}`} />
                  <Meta label={t("promptModelLabel")} value={detail.modelPolicy.defaultModel} />
                  <Meta label="SHA-256" value={detail.contentSha256.slice(0, 16)} mono />
                </div>
                <div>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <label htmlFor="global-prompt-body" className="text-sm font-medium text-foreground">System Prompt</label>
                    {!editing ? <button type="button" onClick={() => setEditing(true)} className="rounded-lg border border-glass-border px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-hover-bg">{t("promptCreateFromVersion")}</button> : null}
                  </div>
                  <textarea id="global-prompt-body" value={editing ? draft : detail.systemPrompt} onChange={(event) => setDraft(event.target.value)} readOnly={!editing} className="min-h-[420px] w-full resize-y rounded-xl border border-glass-border bg-surface p-4 font-mono text-sm leading-relaxed text-foreground outline-none focus:border-primary/60 read-only:text-text-secondary" />
                </div>
                <div className="flex flex-wrap justify-end gap-2 border-t border-glass-border pt-4">
                  {!detail.active && !editing ? <button type="button" onClick={() => void activateVersion()} disabled={saving} className="inline-flex items-center gap-2 rounded-lg border border-primary/40 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/10 disabled:opacity-50"><Check size={15} />{t("promptActivateVersion")}</button> : null}
                  {editing ? (
                    <>
                      <button type="button" onClick={() => { setEditing(false); setDraft(detail.systemPrompt); }} className="rounded-lg border border-glass-border px-4 py-2 text-sm text-text-secondary hover:bg-hover-bg hover:text-foreground">{tc("cancel")}</button>
                      <button type="button" onClick={() => void saveVersion(false)} disabled={saving || !draft.trim()} className="inline-flex items-center gap-2 rounded-lg border border-primary/40 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/10 disabled:opacity-50"><Save size={15} />{t("promptSaveNewVersion")}</button>
                      <button type="button" onClick={() => void saveVersion(true)} disabled={saving || !draft.trim()} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-accent hover:bg-primary-hover disabled:opacity-50">{saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}{t("promptSaveAndActivate")}</button>
                    </>
                  ) : null}
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function Meta({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className="rounded-lg border border-glass-border bg-surface px-3 py-2"><div className="text-sm text-text-muted">{label}</div><div className={`mt-1 truncate text-sm text-foreground ${mono ? "font-mono" : ""}`}>{value}</div></div>;
}
