'use client';

import { useMemo, useState } from 'react';
import { Check, Link2, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { api, crudApi } from '@/lib/api';
import { useProjectStore, type Project } from '@/store/projectStore';
import { toast } from '@/store/toastStore';
import CharacterResourceBindingModal from '../../cast/CharacterResourceBindingModal';
import { getAssetUrl } from '@/lib/utils';

export type ProjectEntityKind = 'character' | 'scene' | 'prop';

export type EntitySuggestion = {
  name: string;
  description?: string;
};

type ProjectEntity = Project['characters'][number] | Project['scenes'][number] | Project['props'][number];

interface ProjectEntityPanelProps {
  kind: ProjectEntityKind;
  suggestions: EntitySuggestion[];
  icon: React.ReactNode;
  emptyTitle: string;
  emptyHint: string;
  countLabel: (count: number) => string;
}

function normalizeName(value: string) {
  return value.trim().toLocaleLowerCase();
}

function characterPreviewUrl(entity: ProjectEntity) {
  const character = entity as Project['characters'][number];
  if (!character.system_character_id) return undefined;
  const selectedSheet = character.reference_sheet?.image_variants?.find(
    (variant) => variant.id === character.reference_sheet?.selected_image_id,
  )?.url;
  return getAssetUrl(
    character.image_url
      || character.reference_image_url
      || selectedSheet
      || character.avatar_url
      || character.full_body_image_url,
  );
}

export default function ProjectEntityPanel({
  kind,
  suggestions,
  icon,
  emptyTitle,
  emptyHint,
  countLabel,
}: ProjectEntityPanelProps) {
  const t = useTranslations('scriptEditor');
  const tScript = useTranslations('script');
  const currentProject = useProjectStore((state) => state.currentProject);
  const updateProject = useProjectStore((state) => state.updateProject);
  const [editing, setEditing] = useState<ProjectEntity | null | 'new'>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [bindingCharacterId, setBindingCharacterId] = useState<string | null>(null);

  const entities = useMemo<ProjectEntity[]>(() => {
    if (!currentProject) return [];
    if (kind === 'character') return currentProject.characters || [];
    if (kind === 'scene') return currentProject.scenes || [];
    return currentProject.props || [];
  }, [currentProject, kind]);

  const unsyncedSuggestions = useMemo(() => {
    const persisted = new Set(entities.map((entity) => normalizeName(entity.name)));
    const unique = new Map<string, EntitySuggestion>();
    for (const suggestion of suggestions) {
      const key = normalizeName(suggestion.name);
      if (key && !persisted.has(key) && !unique.has(key)) unique.set(key, suggestion);
    }
    return Array.from(unique.values());
  }, [entities, suggestions]);

  const refreshProject = async () => {
    if (!currentProject) return;
    const refreshed = await api.getProject(currentProject.id);
    updateProject(currentProject.id, refreshed);
  };

  const persistNewEntity = async (suggestion: EntitySuggestion) => {
    if (!currentProject) throw new Error('No project selected');
    const payload = { name: suggestion.name.trim(), description: suggestion.description || '' };
    if (kind === 'character') await crudApi.createCharacter(currentProject.id, payload);
    else if (kind === 'scene') await crudApi.createScene(currentProject.id, payload);
    else await crudApi.createProp(currentProject.id, payload);
    await refreshProject();
  };

  const createEntity = async (suggestion: EntitySuggestion) => {
    const key = `create:${normalizeName(suggestion.name)}`;
    setBusyKey(key);
    try {
      await persistNewEntity(suggestion);
    } catch (error) {
      console.error('[ScriptEditor] Failed to create entity:', error);
      toast.error(tScript('createFailed'));
    } finally {
      setBusyKey(null);
    }
  };

  const openCreate = () => {
    setName('');
    setDescription('');
    setEditing('new');
  };

  const openEdit = (entity: ProjectEntity) => {
    setName(entity.name);
    setDescription(entity.description || '');
    setEditing(entity);
  };

  const saveEntity = async () => {
    if (!currentProject || !name.trim()) return;
    setBusyKey('save');
    try {
      if (editing === 'new') {
        await persistNewEntity({ name, description });
      } else if (editing) {
        await api.updateAssetAttributes(currentProject.id, editing.id, kind, {
          name: name.trim(),
          description,
        });
        await refreshProject();
      }
      setEditing(null);
    } catch (error) {
      console.error('[ScriptEditor] Failed to save entity:', error);
      toast.error(tScript('saveFailed'));
    } finally {
      setBusyKey(null);
    }
  };

  const deleteEntity = async (entity: ProjectEntity) => {
    if (!currentProject || !window.confirm(tScript('confirmDelete', { name: entity.name }))) return;
    setBusyKey(`delete:${entity.id}`);
    try {
      if (kind === 'character') await crudApi.deleteCharacter(currentProject.id, entity.id);
      else if (kind === 'scene') await crudApi.deleteScene(currentProject.id, entity.id);
      else await crudApi.deleteProp(currentProject.id, entity.id);
      await refreshProject();
    } catch (error) {
      console.error('[ScriptEditor] Failed to delete entity:', error);
      toast.error(tScript('deleteFailed'));
    } finally {
      setBusyKey(null);
    }
  };

  const totalCount = entities.length + unsyncedSuggestions.length;

  return (
    <div className="p-3">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-text-muted">{icon}</span>
        <span className="text-sm font-medium uppercase tracking-wider text-text-muted">
          {countLabel(totalCount)}
        </span>
        <button
          type="button"
          onClick={openCreate}
          className="ml-auto inline-flex items-center gap-1 rounded-md border border-foreground/10 px-2 py-1 text-sm text-text-secondary transition-colors hover:border-primary/40 hover:text-primary"
        >
          <Plus size={12} />
          {t('panels.addEntity')}
        </button>
      </div>

      {totalCount === 0 ? (
        <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-elevated text-text-muted">
            {icon}
          </div>
          <p className="text-sm text-text-muted">{emptyTitle}</p>
          <p className="mt-1 text-sm text-text-muted/60">{emptyHint}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {entities.map((entity) => (
            <article key={entity.id} className="rounded-lg border border-foreground/10 bg-elevated/80 p-3">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {kind === 'character' && characterPreviewUrl(entity) ? (
                      <button
                        type="button"
                        onClick={() => setBindingCharacterId(entity.id)}
                        className="size-5 shrink-0 overflow-hidden rounded-full border border-foreground/15 bg-black/20 transition-colors hover:border-primary/50"
                        aria-label={t('panels.bindCharacterAssets')}
                        title={t('panels.bindCharacterAssets')}
                      >
                        <img src={characterPreviewUrl(entity)} alt={entity.name} className="size-full object-cover" />
                      </button>
                    ) : null}
                    <h3 className="truncate text-sm font-medium text-foreground">{entity.name}</h3>
                    <span className="inline-flex items-center gap-1 rounded-full bg-status-completed-bg px-1.5 py-0.5 text-[10px] text-status-completed-fg">
                      <Check size={9} /> {t('panels.syncedToCast')}
                    </span>
                  </div>
                  {entity.description ? (
                    <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-text-muted">{entity.description}</p>
                  ) : null}
                </div>
                {kind === 'character' ? (
                  <button
                    type="button"
                    onClick={() => setBindingCharacterId(entity.id)}
                    className={`transition-colors hover:text-primary ${'system_character_id' in entity && entity.system_character_id ? 'text-primary' : 'text-text-muted'}`}
                    aria-label={t('panels.bindCharacterAssets')}
                    title={t('panels.bindCharacterAssets')}
                  >
                    <Link2 size={13} />
                  </button>
                ) : null}
                <button type="button" onClick={() => openEdit(entity)} className="text-text-muted transition-colors hover:text-primary" aria-label={t('panels.editEntity')}>
                  <Pencil size={13} />
                </button>
                <button type="button" onClick={() => void deleteEntity(entity)} disabled={busyKey === `delete:${entity.id}`} className="text-text-muted transition-colors hover:text-status-error-fg disabled:opacity-50" aria-label={t('panels.deleteEntity')}>
                  {busyKey === `delete:${entity.id}` ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                </button>
              </div>
            </article>
          ))}

          {unsyncedSuggestions.map((suggestion) => {
            const key = `create:${normalizeName(suggestion.name)}`;
            return (
              <article key={suggestion.name} className="rounded-lg border border-dashed border-primary/25 bg-primary/[0.04] p-3">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-medium text-foreground">{suggestion.name}</h3>
                    <p className="mt-0.5 text-[11px] text-primary">{t('panels.detectedInScript')}</p>
                    {suggestion.description ? <p className="mt-1 text-sm text-text-muted">{suggestion.description}</p> : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => void createEntity(suggestion)}
                    disabled={busyKey === key}
                    className="inline-flex shrink-0 items-center gap-1 rounded-md bg-primary/15 px-2 py-1 text-sm text-primary transition-colors hover:bg-primary/25 disabled:opacity-50"
                  >
                    {busyKey === key ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                    {t('panels.addToCast')}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {editing ? (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-overlay/80 p-4 backdrop-blur-sm" onMouseDown={() => setEditing(null)}>
          <div className="w-full max-w-md rounded-2xl border border-foreground/10 bg-elevated p-5 shadow-2xl" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={editing === 'new' ? t('panels.addEntity') : t('panels.editEntity')}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-medium text-foreground">{editing === 'new' ? t('panels.addEntity') : t('panels.editEntity')}</h2>
              <button type="button" onClick={() => setEditing(null)} className="text-text-muted hover:text-foreground" aria-label={t('dialogs.pipeline.cancel')}><X size={16} /></button>
            </div>
            <label className="mb-3 block text-sm text-text-secondary">
              <span className="mb-1 block">{t('panels.entityName')}</span>
              <input value={name} onChange={(event) => setName(event.target.value)} className="w-full rounded-lg border border-foreground/10 bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" autoFocus />
            </label>
            <label className="block text-sm text-text-secondary">
              <span className="mb-1 block">{t('panels.entityDescription')}</span>
              <textarea value={description} onChange={(event) => setDescription(event.target.value)} className="h-28 w-full resize-none rounded-lg border border-foreground/10 bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setEditing(null)} className="rounded-lg px-3 py-2 text-sm text-text-muted hover:text-foreground">{t('dialogs.pipeline.cancel')}</button>
              <button type="button" onClick={() => void saveEntity()} disabled={!name.trim() || busyKey === 'save'} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
                {busyKey === 'save' ? <Loader2 size={13} className="animate-spin" /> : null}
                {t('panels.saveEntity')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <CharacterResourceBindingModal
        character={kind === 'character'
          ? currentProject?.characters?.find((character) => character.id === bindingCharacterId) ?? null
          : null}
        onClose={() => setBindingCharacterId(null)}
      />
    </div>
  );
}
