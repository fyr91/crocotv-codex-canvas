export const providerModels: {
  volcengineLlm: string[];
  bigmodelLlm: string[];
  runwareLlm: string[];
  image: string[];
  video: string[];
  music: string;
} = {
  volcengineLlm: ["doubao-seed-2-1-turbo-260628", "deepseek-v4-flash-ga-260731", "deepseek-v4-pro-260425"],
  bigmodelLlm: ["glm-5.2", "glm-5v-turbo"],
  runwareLlm: ["google:gemini@3.1-pro", "google:gemini@3-flash", "google:gemini@3.1-flash-lite"],
  image: ["google:nano-banana@2-lite", "google:4@1", "openai:gpt-image@2"],
  video: ["MiniMax H3"],
  music: process.env.SUNO_MODEL || "V4_5ALL",
};

const settingsSurfaces = ["project_settings", "series_settings", "global_settings"];
const videoSurfaces = [...settingsSurfaces, "video_sidebar"];
const imageParams = {
  ratio: { options: ["16:9", "9:16", "4:3", "3:4", "1:1"], default: "1:1" },
};
const videoParams = {
  resolution: { options: ["preview", "720p", "1080p"], default: "preview" },
  ratio: { options: ["16:9", "9:16", "1:1"], default: "16:9" },
  promptExtend: true,
};

export function getStudioModelCatalog() {
  return {
    schemaVersion: 1,
    generatedFrom: "server/model-catalog.ts",
    compat: { legacy_model_ids: {} },
    defaults: {
      text_model: "deepseek-v4-flash-ga-260731",
      canonical_model_settings: imageDefaults(),
      model_settings: imageDefaults(),
    },
    providers: {
      ark: { id: "ark", display_name: "火山方舟 Ark", secret_keys: ["ARK_API_KEY"] },
      bigmodel: { id: "bigmodel", display_name: "BigModel", secret_keys: ["BIGMODEL_API_KEY"] },
      runware: { id: "runware", display_name: "Runware", secret_keys: ["RUNWARE_API_KEY"] },
      h3: { id: "h3", display_name: "MiniMax H3", secret_keys: ["H3_API_KEY"] },
      suno: { id: "suno", display_name: "Suno", secret_keys: ["SUNO_API_KEY"] },
      characters: { id: "characters", display_name: "Croco 角色服务", secret_keys: ["CROCO_CHARACTERS_API_TOKEN"] },
      tts: { id: "tts", display_name: "豆包 TTS", secret_keys: ["DOUBAO_TTS_API_KEY"] },
    },
    families: {
      ark: { family: "ark", display_name: "火山方舟 Ark" },
      bigmodel: { family: "bigmodel", display_name: "BigModel" },
      runware: { family: "runware", display_name: "Runware" },
      minimax: { family: "minimax", display_name: "MiniMax" },
    },
    models: {
      ...textModels(),
      "google:nano-banana@2-lite": imageModel("google:nano-banana@2-lite", "Nano Banana 2 Lite", "Croco Runware 快速图片生成与参考图编辑模型", 100, true),
      "google:4@1": imageModel("google:4@1", "Nano Banana", "Croco Runware 高质量图片生成与参考图编辑模型", 90, false),
      "openai:gpt-image@2": imageModel("openai:gpt-image@2", "GPT Image 02", "Croco Runware GPT Image 图片生成与编辑模型", 80, false),
      "minimax-h3": videoModel("minimax-h3", "MiniMax H3", "统一支持文生视频、首帧、首尾帧与图片/音频多参考；默认先生成结构化 H3 提示词", "i2v", videoSurfaces, ["t2v", "i2v", "fl2v", "r2v"]),
    },
    model_lines: {
      "runware-image": { id: "runware-image", family: "runware", modes: ["t2i", "i2i"], legacy_model_ids: [...providerModels.image] },
      "minimax-h3": { id: "minimax-h3", family: "minimax", modes: ["t2v", "i2v", "fl2v", "r2v"], legacy_model_ids: ["minimax-h3", "minimax-h3-r2v"] },
    },
    modes: {
      "runware/runware-image#t2i": mode("runware/runware-image#t2i", "runware-image", "google:nano-banana@2-lite", "t2i", "runware", "image", settingsSurfaces),
      "runware/runware-image#i2i": mode("runware/runware-image#i2i", "runware-image", "google:nano-banana@2-lite", "i2i", "runware", "image", settingsSurfaces),
      "minimax/minimax-h3#t2v": mode("minimax/minimax-h3#t2v", "minimax-h3", "minimax-h3", "t2v", "minimax", "i2v", videoSurfaces),
      "minimax/minimax-h3#i2v": mode("minimax/minimax-h3#i2v", "minimax-h3", "minimax-h3", "i2v", "minimax", "i2v", videoSurfaces),
      "minimax/minimax-h3#fl2v": mode("minimax/minimax-h3#fl2v", "minimax-h3", "minimax-h3", "fl2v", "minimax", "i2v", videoSurfaces),
      "minimax/minimax-h3#r2v": mode("minimax/minimax-h3#r2v", "minimax-h3", "minimax-h3", "r2v", "minimax", "r2v", videoSurfaces),
    },
  };
}

function imageDefaults() {
  return { t2i_model: providerModels.image[0], i2i_model: providerModels.image[0], image_model: providerModels.image[0], i2v_model: "minimax-h3", r2v_model: "minimax-h3" };
}

function textModels() {
  return Object.fromEntries([
    ...providerModels.volcengineLlm.map((id) => [id, textModel(id, id.startsWith("deepseek") ? "DeepSeek" : "Doubao Seed", "ark")]),
    ...providerModels.bigmodelLlm.map((id) => [id, textModel(id, id.toUpperCase(), "bigmodel")]),
    ...providerModels.runwareLlm.map((id) => [id, textModel(id, id.replace("google:", "").replace("@", " "), "runware")]),
  ]);
}

function textModel(id: string, displayName: string, family: string) {
  return { id, display_name: displayName, description: "Croco 文本与多模态任务模型", family, status: "active", capabilities: id === "glm-5v-turbo" ? ["text", "vision"] : ["text"], duration: null, params: {}, inputs: {}, ui: { selection_group: "text", visible_in: ["global_settings"], recommended: id === "deepseek-v4-flash-ga-260731", order: 50, badges: ["Croco"] } };
}

function imageModel(id: string, name: string, description: string, order: number, recommended: boolean) {
  return { id, display_name: name, description, family: "runware", status: "active", capabilities: ["t2i", "i2i"], duration: null, params: imageParams, inputs: { reference_images: { max: 9 } }, ui: { selection_group: "image", visible_in: settingsSurfaces, recommended, order, badges: recommended ? ["推荐", "Croco"] : ["Croco"] } };
}

function videoModel(id: string, name: string, description: string, selectionGroup: string, visibleIn: string[], capabilities: string[]) {
  return { id, display_name: name, description, family: "minimax", status: "active", capabilities, duration: { type: "slider", min: 3, max: 15, step: 1, default: 6 }, params: videoParams, inputs: { reference_images: { max: 9 }, reference_audio: { max: 3 }, first_frame: { max: 1, ordered: true }, last_frame: { max: 1, ordered: true } }, ui: { selection_group: selectionGroup, visible_in: visibleIn, recommended: true, order: 100, badges: ["推荐", "Croco"] } };
}

function mode(id: string, modelLineId: string, legacyModelId: string, modeName: string, family: string, selectionGroup: string, visibleIn: string[]) {
  return { id, model_line_id: modelLineId, legacy_model_id: legacyModelId, mode: modeName, family, status: "active", capabilities: [modeName], runtime: { croco: { gateway: legacyModelId === "minimax-h3-r2v" ? "minimax-h3" : legacyModelId } }, ui: { selection_group: selectionGroup, visible_in: visibleIn, recommended: true, order: 100, badges: ["Croco"] } };
}
