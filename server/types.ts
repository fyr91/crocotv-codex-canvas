export type StoredResource = {
  id: string;
  name: string;
  type: "image" | "video" | "audio" | "file";
  mimeType: string;
  size: number;
  fileName: string;
  url: string;
  createdAt: string;
  source: "upload" | "canvas" | "runware" | "h3" | "happyhorse" | "speech" | "suno" | "character";
  metadata?: Record<string, unknown>;
};

export type CharacterEntry = {
  id: string;
  name: string;
  chineseName: string;
  voiceId: string;
  directory: string;
  avatarUrl?: string;
  primaryResourceId?: string;
};
