import { create } from "zustand";
import type { FactoryArtifactVersion, FactoryLayer, FactorySnapshot } from "@/types/content-factory";

type FactoryStore = {
    snapshot: FactorySnapshot | null;
    hydrate: (snapshot: FactorySnapshot) => void;
    restore: (snapshot: FactorySnapshot) => void;
    removeSection: (sectionId: string) => void;
    insertSection: (position: number, section: FactorySnapshot["sections"][number]) => void;
    patchProject: (patch: Partial<FactorySnapshot["project"]>) => void;
    selectVersion: (sectionId: string, layer: FactoryLayer, artifactId: string) => void;
    addVersion: (sectionId: string, artifact: FactoryArtifactVersion) => void;
};

export const useContentFactoryStore = create<FactoryStore>((set) => ({
    snapshot: null,
    hydrate: (snapshot) => set({ snapshot }),
    restore: (snapshot) => set({ snapshot }),
    removeSection: (sectionId) => set((state) => state.snapshot ? { snapshot: { ...state.snapshot, sections: state.snapshot.sections.filter((section) => section.id !== sectionId) } } : state),
    insertSection: (position, inserted) => set((state) => state.snapshot ? { snapshot: { ...state.snapshot, sections: [...state.snapshot.sections.map((section) => section.position >= position ? { ...section, position: section.position + 1 } : section), inserted].sort((a, b) => a.position - b.position) } } : state),
    patchProject: (patch) => set((state) => state.snapshot ? { snapshot: { ...state.snapshot, project: { ...state.snapshot.project, ...patch } } } : state),
    selectVersion: (sectionId, layer, artifactId) => set((state) => state.snapshot ? { snapshot: { ...state.snapshot, sections: state.snapshot.sections.map((section) => section.id !== sectionId ? section : { ...section, artifacts: { ...section.artifacts, [layer]: section.artifacts[layer].map((artifact) => ({ ...artifact, selected: artifact.id === artifactId })) } }) } } : state),
    addVersion: (sectionId, artifact) => set((state) => state.snapshot ? { snapshot: { ...state.snapshot, sections: state.snapshot.sections.map((section) => section.id !== sectionId ? section : { ...section, artifacts: { ...section.artifacts, [artifact.layer]: [...section.artifacts[artifact.layer].map((item) => ({ ...item, selected: false })), artifact] } }) } } : state),
}));
