import { Select } from "antd";
import type { FactoryArtifactVersion } from "@/types/content-factory";

export function VersionMenu({ versions, selectedId, onSelect }: { versions: FactoryArtifactVersion[]; selectedId?: string; onSelect: (id: string) => void }) {
    if (versions.length < 2) return versions[0] ? <span className="rounded bg-black/55 px-1.5 py-0.5 text-[10px] text-white">V{versions[0].version}</span> : null;
    return <Select size="small" variant="borderless" value={selectedId} popupMatchSelectWidth={96} className="!h-6 !min-w-16 rounded bg-black/55 text-[10px] [&_.ant-select-selection-item]:!text-white" options={[...versions].reverse().map((item) => ({ value: item.id, label: `V${item.version}` }))} onChange={onSelect} />;
}
