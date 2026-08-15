"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, GitBranch, Loader2, Save, X } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  api,
  type ProjectPromptOperationStrategy,
  type ProjectPromptStrategyResponse,
  type StudioPromptOperation,
} from "@/lib/api";
import { useProjectStore } from "@/store/projectStore";
import { toast } from "@/store/toastStore";

interface PromptConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const OPERATION_KEYS: Record<StudioPromptOperation, string> = {
  entity_extraction: "promptOperationEntity",
  style_analysis: "promptOperationStyle",
  storyboard_extraction: "promptOperationStoryboard",
  storyboard_polish: "promptOperationShotRevision",
  video_polish: "promptOperationVideo",
  r2v_polish: "promptOperationR2v",
};

export default function PromptConfigModal({ isOpen, onClose }: PromptConfigModalProps) {
  const t = useTranslations("project");
  const tc = useTranslations("common");
  const currentProject = useProjectStore((state) => state.currentProject);
  const [strategy, setStrategy] = useState<ProjectPromptStrategyResponse | null>(null);
  const [selectedOperation, setSelectedOperation] = useState<StudioPromptOperation>("entity_extraction");
  const [selectedVersion, setSelectedVersion] = useState("");
  const [selectedSource, setSelectedSource] = useState<"global" | "project">("global");
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const selected = useMemo(() => strategy?.operations.find((item) => item.operation === selectedOperation) || null, [selectedOperation, strategy]);

  const showEffective = useCallback(async (operation: ProjectPromptOperationStrategy) => {
    const projectVersion = operation.projectVersions.find((version) => version.templateVersion === operation.effective.templateVersion);
    if (projectVersion) {
      setSelectedSource("project");
      setSelectedVersion(projectVersion.templateVersion);
      setDraft(projectVersion.systemPrompt);
      setEditing(false);
      return;
    }
    setSelectedSource("global");
    setSelectedVersion(operation.effective.templateVersion);
    const globalDetail = await api.getPromptTemplate(operation.templateKey, operation.effective.templateVersion);
    setDraft(globalDetail.systemPrompt);
    setEditing(false);
  }, []);

  const loadStrategy = useCallback(async () => {
    if (!currentProject) return;
    setLoading(true);
    try {
      const next = await api.getProjectPromptStrategy(currentProject.id);
      setStrategy(next);
      const operation = next.operations.find((item) => item.operation === "entity_extraction") || next.operations[0];
      if (operation) {
        setSelectedOperation(operation.operation);
        await showEffective(operation);
      }
    } catch {
      toast.error(t("promptLoadFailed"));
    } finally {
      setLoading(false);
    }
  }, [currentProject, showEffective, t]);

  useEffect(() => {
    if (isOpen) void loadStrategy();
  }, [isOpen, loadStrategy]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  const chooseOperation = async (operation: ProjectPromptOperationStrategy) => {
    setSelectedOperation(operation.operation);
    setLoading(true);
    try {
      await showEffective(operation);
    } catch {
      toast.error(t("promptLoadFailed"));
    } finally {
      setLoading(false);
    }
  };

  const chooseGlobalVersion = async (operation: ProjectPromptOperationStrategy, version: string) => {
    setSelectedSource("global");
    setSelectedVersion(version);
    setLoading(true);
    try {
      const nextDetail = await api.getPromptTemplate(operation.templateKey, version);
      setDraft(nextDetail.systemPrompt);
      setEditing(false);
    } catch {
      toast.error(t("promptLoadFailed"));
    } finally {
      setLoading(false);
    }
  };

  const chooseProjectVersion = (version: ProjectPromptOperationStrategy["projectVersions"][number]) => {
    setSelectedSource("project");
    setSelectedVersion(version.templateVersion);
    setDraft(version.systemPrompt);
    setEditing(false);
  };

  const applyBinding = async (mode: "follow_global" | "pin_global" | "project", version?: string) => {
    if (!currentProject || !selected || !strategy) return;
    setSaving(true);
    try {
      const next = await api.setProjectPromptBinding(currentProject.id, selected.operation, { mode, templateVersion: version, expectedVersion: strategy.projectVersion });
      setStrategy(next);
      const operation = next.operations.find((item) => item.operation === selected.operation);
      if (operation) await showEffective(operation);
      toast.success(t("promptBindingUpdated"));
    } catch {
      toast.error(t("promptBindingUpdateFailed"));
    } finally {
      setSaving(false);
    }
  };

  const createProjectVersion = async () => {
    if (!currentProject || !selected || !strategy || !draft.trim()) return;
    setSaving(true);
    try {
      const next = await api.createProjectPromptVersion(currentProject.id, selected.operation, { baseVersion: selectedVersion, systemPrompt: draft, activate: true, expectedVersion: strategy.projectVersion });
      setStrategy(next);
      const operation = next.operations.find((item) => item.operation === selected.operation);
      if (operation) await showEffective(operation);
      toast.success(t("promptProjectVersionSaved"));
    } catch {
      toast.error(t("promptSaveFailed"));
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-overlay p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="project-prompt-title" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-glass-border bg-elevated shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-glass-border px-6 py-5">
          <div>
            <div className="mb-1 flex items-center gap-2 text-sm text-text-muted"><GitBranch size={14} />{currentProject?.title}</div>
            <h2 id="project-prompt-title" className="text-xl font-medium text-foreground">{t("promptStrategyTitle")}</h2>
            <p className="mt-1 text-sm text-text-secondary">{t("promptStrategyDesc")}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-text-secondary hover:bg-hover-bg hover:text-foreground" aria-label={tc("close")}><X size={18} /></button>
        </header>

        <div className="grid min-h-0 flex-1 md:grid-cols-[260px_1fr]">
          <aside className="overflow-y-auto border-b border-glass-border p-4 md:border-b-0 md:border-r">
            <div className="space-y-2">
              {strategy?.operations.map((operation) => (
                <button key={operation.operation} type="button" onClick={() => void chooseOperation(operation)} className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${selectedOperation === operation.operation ? "border-primary bg-primary/10" : "border-glass-border hover:bg-hover-bg"}`}>
                  <div className="text-sm font-medium text-foreground">{t(OPERATION_KEYS[operation.operation] as any)}</div>
                  <div className="mt-1 truncate font-mono text-sm text-text-muted">{operation.templateKey}</div>
                  <div className="mt-1 text-sm text-text-secondary">{bindingLabel(operation.binding.source, t)}</div>
                </button>
              ))}
            </div>
          </aside>

          <section className="min-h-0 overflow-y-auto p-6">
            {loading || !selected ? (
              <div className="flex min-h-72 items-center justify-center gap-2 text-sm text-text-secondary"><Loader2 size={18} className="animate-spin" />{t("loadingConfig")}</div>
            ) : (
              <div className="space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-medium text-foreground">{t(OPERATION_KEYS[selected.operation] as any)}</h3>
                    <p className="mt-1 font-mono text-sm text-text-muted">{selected.templateKey}</p>
                  </div>
                  <button type="button" onClick={() => void applyBinding("follow_global")} disabled={saving || selected.binding.source === "builtin"} className="rounded-lg border border-glass-border px-3 py-2 text-sm text-foreground hover:bg-hover-bg disabled:opacity-40">{t("promptFollowGlobal")}</button>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <VersionGroup title={t("promptGlobalVersions")}>
                    {selected.globalVersions.map((version) => (
                      <VersionButton key={version.templateVersion} label={`v${version.templateVersion}`} active={selected.binding.source === "global-pinned" && selected.binding.templateVersion === version.templateVersion} selected={selectedSource === "global" && selectedVersion === version.templateVersion} source={version.active ? t("promptGlobalActive") : undefined} onSelect={() => void chooseGlobalVersion(selected, version.templateVersion)} actionLabel={t("promptPinVersion")} onAction={() => void applyBinding("pin_global", version.templateVersion)} disabled={saving} />
                    ))}
                  </VersionGroup>
                  <VersionGroup title={t("promptProjectVersions")}>
                    {selected.projectVersions.length ? selected.projectVersions.map((version) => (
                      <VersionButton key={version.templateVersion} label={version.templateVersion} active={selected.binding.source !== "builtin" && selected.binding.source !== "global-pinned" && selected.binding.templateVersion === version.templateVersion} selected={selectedSource === "project" && selectedVersion === version.templateVersion} source={version.source === "legacy-studio-migration" ? t("promptLegacyVersion") : t("promptProjectVersion")} onSelect={() => chooseProjectVersion(version)} actionLabel={t("promptUseVersion")} onAction={() => void applyBinding("project", version.templateVersion)} disabled={saving} />
                    )) : <p className="px-1 py-3 text-sm text-text-muted">{t("promptNoProjectVersions")}</p>}
                  </VersionGroup>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <label htmlFor="project-prompt-body" className="text-sm font-medium text-foreground">{t("systemPromptLabel")} · {selectedVersion}</label>
                    {!editing ? <button type="button" onClick={() => setEditing(true)} className="rounded-lg border border-glass-border px-3 py-1.5 text-sm text-foreground hover:bg-hover-bg">{t("promptCreateProjectVersion")}</button> : null}
                  </div>
                  <textarea id="project-prompt-body" value={draft} onChange={(event) => setDraft(event.target.value)} readOnly={!editing} className="min-h-[360px] w-full resize-y rounded-xl border border-glass-border bg-surface p-4 font-mono text-sm leading-relaxed text-foreground outline-none focus:border-primary/60 read-only:text-text-secondary" />
                </div>
                {editing ? (
                  <div className="flex justify-end gap-2 border-t border-glass-border pt-4">
                    <button type="button" onClick={() => setEditing(false)} className="rounded-lg border border-glass-border px-4 py-2 text-sm text-text-secondary hover:bg-hover-bg hover:text-foreground">{tc("cancel")}</button>
                    <button type="button" onClick={() => void createProjectVersion()} disabled={saving || !draft.trim()} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-accent hover:bg-primary-hover disabled:opacity-50">{saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}{t("promptSaveProjectVersion")}</button>
                  </div>
                ) : null}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function VersionGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="rounded-xl border border-glass-border p-3"><h4 className="mb-2 text-sm font-medium text-foreground">{title}</h4><div className="max-h-48 space-y-2 overflow-y-auto">{children}</div></div>;
}

function VersionButton({ label, source, active, selected, actionLabel, onSelect, onAction, disabled }: { label: string; source?: string; active: boolean; selected: boolean; actionLabel: string; onSelect: () => void; onAction: () => void; disabled: boolean }) {
  return (
    <div className={`flex items-center gap-2 rounded-lg border p-2 ${selected ? "border-primary bg-primary/10" : "border-glass-border"}`}>
      <button type="button" onClick={onSelect} className="min-w-0 flex-1 text-left"><div className="truncate text-sm font-medium text-foreground">{label}</div>{source ? <div className="mt-0.5 text-sm text-text-muted">{source}</div> : null}</button>
      {active ? <Check size={15} className="shrink-0 text-status-completed-fg" /> : <button type="button" onClick={onAction} disabled={disabled} className="shrink-0 rounded-md border border-glass-border px-2 py-1 text-sm text-text-secondary hover:bg-hover-bg hover:text-foreground disabled:opacity-50">{actionLabel}</button>}
    </div>
  );
}

function bindingLabel(source: ProjectPromptOperationStrategy["binding"]["source"], t: ReturnType<typeof useTranslations>) {
  if (source === "builtin") return t("promptBindingGlobal");
  if (source === "global-pinned") return t("promptBindingPinned");
  if (source === "legacy-studio-migration") return t("promptBindingLegacy");
  return t("promptBindingProject");
}
