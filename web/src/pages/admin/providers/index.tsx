import { App, Button, Form, Input, InputNumber, Modal, Select, Space, Switch, Table, Tag } from "antd";
import { useEffect, useState } from "react";

import { getAdminProviders, manageProvider, syncLtxCapabilities, type ProviderCatalog, type ProviderChannel, type ProviderModel } from "@/services/api/admin-providers";
import { videoInputModeOptions } from "@/lib/video-input-mode";
import { AdminPage } from "@/components/layout/page-shell";

const capabilityOptions = [
    { value: "llm", label: "LLM" }, { value: "image", label: "图片" }, { value: "video", label: "视频" }, { value: "speech", label: "语音" }, { value: "music", label: "音乐" },
];

const inputModalityOptions = [
    { value: "text", label: "文字" }, { value: "image", label: "图片" }, { value: "video", label: "视频" }, { value: "audio", label: "音频" },
];

const soulVoiceSample = `[
  {
    "name": "兔子玉兰",
    "speakerId": "S_yrLIocGL1"
  },
  {
    "name": "鳄鱼爸爸",
    "speakerId": "S_eH42pcGL1"
  }
]`;

export default function AdminProvidersPage() {
    const { message } = App.useApp();
    const [catalog, setCatalog] = useState<ProviderCatalog>({ channels: [], models: [] });
    const [loading, setLoading] = useState(false);
    const [testingProvider, setTestingProvider] = useState<string | null>(null);
    const [channel, setChannel] = useState<ProviderChannel | null>(null);
    const [credentialProvider, setCredentialProvider] = useState<ProviderChannel | null>(null);
    const [model, setModel] = useState<ProviderModel | "new" | null>(null);
    const [pricingModel, setPricingModel] = useState<ProviderModel | null>(null);
    const [syncingModelId, setSyncingModelId] = useState<string | null>(null);
    const [channelForm] = Form.useForm(); const [credentialForm] = Form.useForm(); const [modelForm] = Form.useForm(); const [pricingForm] = Form.useForm();
    const modelCapability = Form.useWatch("capability", modelForm);
    const load = async () => { setLoading(true); try { setCatalog(await getAdminProviders()); } catch (error) { message.error(error instanceof Error ? error.message : "服务配置加载失败"); } finally { setLoading(false); } };
    useEffect(() => { void load(); }, []);
    const submit = async (body: Record<string, unknown>) => { try { await manageProvider(body); await load(); message.success("配置已保存"); return true; } catch (error) { message.error(error instanceof Error ? error.message : "保存失败"); return false; } };
    const testConnection = async (item: ProviderChannel) => { setTestingProvider(item.id); try { const result = await manageProvider({ action: "test-connection", providerId: item.id }); const count = Array.isArray(result?.capabilities?.workflows) ? result.capabilities.workflows.length : 0; message.success(`LTX 连接正常，读取到 ${count} 个 GPU 工作流`); } catch (error) { message.error(error instanceof Error ? error.message : "LTX 连接测试失败"); } finally { setTestingProvider(null); } };
    const syncLtx = async (item: ProviderModel) => { setSyncingModelId(item.id); try { await syncLtxCapabilities(item.id); await load(); message.success("LTX 固定配置已同步"); } catch (error) { message.error(error instanceof Error ? error.message : "LTX 配置同步失败"); } finally { setSyncingModelId(null); } };
    const openChannel = (item: ProviderChannel) => { setChannel(item); channelForm.setFieldsValue({ baseUrl: item.base_url, enabled: item.enabled, customVoices: item.id === "doubao_speech" ? JSON.stringify(item.custom_voices || [], null, 2) : undefined }); };
    const openModel = (item: ProviderModel | "new") => { setModel(item); const config = item === "new" ? {} : Object.fromEntries(Object.entries(item.config || {}).filter(([key]) => key !== "inputModalities" && key !== "videoInputModes")); modelForm.setFieldsValue(item === "new" ? { enabled: true, isDefault: false, config: "{}", inputModalities: ["text"], videoInputModes: ["multimodal"] } : { providerId: item.provider_id, capability: item.capability, modelKey: item.model_key, displayName: item.display_name, enabled: item.enabled, isDefault: item.is_default, config: JSON.stringify(config, null, 2), inputModalities: Array.isArray(item.config?.inputModalities) ? item.config.inputModalities : ["text"], videoInputModes: Array.isArray(item.config?.videoInputModes) ? item.config.videoInputModes : ["multimodal"] }); };
    const openPricing = (item: ProviderModel) => { setPricingModel(item); pricingForm.setFieldsValue(item.pricing || {}); };
    return (
        <AdminPage title="全局服务配置" description="所有用户共用以下凭据、模型清单和参考价格">
            <h2 className="mb-3 text-base font-medium">服务渠道</h2>
            <Table className="mb-8" rowKey="id" loading={loading} dataSource={catalog.channels} pagination={false} columns={[
                { title: "渠道", render: (_, item) => <div><div className="font-medium">{item.display_name}</div><div className="text-xs text-stone-500">{item.base_url}</div></div> },
                { title: "状态", dataIndex: "enabled", render: (value) => <Tag color={value ? "green" : "default"}>{value ? "启用" : "停用"}</Tag> },
                { title: "凭据", render: (_, item) => <Tag color={item.credentialConfigured ? "blue" : "orange"}>{item.credentialConfigured ? item.credentialHint || "已配置" : "未配置"}</Tag> },
                { title: "操作", render: (_, item) => <Space wrap><Button size="small" onClick={() => openChannel(item)}>渠道设置</Button><Button size="small" type="primary" ghost onClick={() => { setCredentialProvider(item); credentialForm.resetFields(); }}>更新凭据</Button>{item.id === "ltx" ? <Button size="small" loading={testingProvider === item.id} onClick={() => void testConnection(item)}>测试连接</Button> : null}</Space> },
            ]} />
            <div className="mb-3 flex items-center justify-between"><h2 className="text-base font-medium">统一模型清单</h2><Button type="primary" onClick={() => openModel("new")}>新增模型</Button></div>
            <Table rowKey="id" loading={loading} dataSource={catalog.models} pagination={{ pageSize: 20 }} columns={[
                { title: "模型", render: (_, item) => <div><div className="font-medium">{item.display_name}</div><div className="text-xs text-stone-500">{item.model_key}</div></div> },
                { title: "能力", dataIndex: "capability", render: (value) => capabilityOptions.find((item) => item.value === value)?.label },
                { title: "渠道", dataIndex: "provider_id", render: (value) => catalog.channels.find((item) => item.id === value)?.display_name || value },
                { title: "状态", render: (_, item) => <Space><Tag color={item.enabled ? "green" : "default"}>{item.enabled ? "启用" : "停用"}</Tag>{item.is_default ? <Tag color="blue">默认</Tag> : null}</Space> },
                { title: "参考价格", render: (_, item) => priceLabel(item) },
                { title: "操作", render: (_, item) => <Space wrap><Button size="small" onClick={() => openModel(item)}>编辑</Button><Button size="small" onClick={() => openPricing(item)}>参考价格</Button>{item.provider_id === "ltx" && item.capability === "video" ? <Button size="small" loading={syncingModelId === item.id} onClick={() => void syncLtx(item)}>同步 LTX 配置</Button> : null}<Button size="small" onClick={() => void submit({ action: "set-model-enabled", modelId: item.id, enabled: !item.enabled })}>{item.enabled ? "停用" : "启用"}</Button></Space> },
            ]} />

            <Modal title="渠道设置" open={Boolean(channel)} onCancel={() => setChannel(null)} onOk={() => void channelForm.validateFields().then(async (values) => { let customVoices; try { customVoices = channel?.id === "doubao_speech" ? JSON.parse(values.customVoices || "[]") : undefined; } catch { message.error("音色配置必须是有效 JSON"); return; } if (await submit({ action: "channel", providerId: channel!.id, ...values, customVoices })) setChannel(null); })}><Form form={channelForm} layout="vertical"><Form.Item name="baseUrl" label="Base URL" rules={[{ required: true }, { type: "url" }]}><Input /></Form.Item>{channel?.id === "doubao_speech" ? <Form.Item name="customVoices" label="Soul 音色 JSON" rules={[{ required: true }]}><Input.TextArea autoSize={{ minRows: 8, maxRows: 18 }} placeholder={soulVoiceSample} /></Form.Item> : null}{channel?.id === "doubao_speech" ? <div className="mb-5 text-xs text-stone-500"><div className="mb-1">Sample JSON</div><pre className="overflow-x-auto rounded-lg bg-stone-100 p-3 text-stone-600">{soulVoiceSample}</pre></div> : null}<Form.Item name="enabled" label="启用" valuePropName="checked"><Switch /></Form.Item></Form></Modal>
            <Modal title={`更新${credentialProvider?.display_name || ""}凭据`} open={Boolean(credentialProvider)} onCancel={() => setCredentialProvider(null)} onOk={() => void credentialForm.validateFields().then(async (values) => { if (await submit({ action: "credentials", providerId: credentialProvider!.id, credentials: values })) setCredentialProvider(null); })}><Form form={credentialForm} layout="vertical">{credentialProvider?.id === "doubao_speech" ? <><Form.Item name="appId" label="AppID" rules={[{ required: !credentialProvider.credentialConfigured }]}><Input.Password placeholder={credentialProvider.credentialConfigured ? "留空则保留当前值" : undefined} /></Form.Item><Form.Item name="accessToken" label="Speech Access Token" rules={[{ required: !credentialProvider.credentialConfigured }]}><Input.Password placeholder={credentialProvider.credentialConfigured ? "留空则保留当前值" : undefined} /></Form.Item><Form.Item name="resourceId" label="Resource ID" rules={[{ required: !credentialProvider.credentialConfigured }]}><Input placeholder={credentialProvider.credentialConfigured ? "留空则保留当前值" : undefined} /></Form.Item></> : <Form.Item name="apiKey" label={credentialProvider?.id === "ltx" ? "LTX 服务 API Key" : "全局 API Key"} rules={[{ required: !credentialProvider?.credentialConfigured }]}><Input.Password placeholder={credentialProvider?.credentialConfigured ? "留空则保留当前值" : undefined} /></Form.Item>}</Form><p className="text-sm text-stone-500">已配置时只填写需要修改的字段，留空会保留原值；系统不会返回凭据明文。</p></Modal>
            <Modal title={model === "new" ? "新增模型" : "编辑模型"} open={Boolean(model)} onCancel={() => setModel(null)} onOk={() => void modelForm.validateFields().then(async (values) => { let config; try { config = JSON.parse(values.config || "{}"); } catch { message.error("参数限制必须是有效 JSON"); return; } const { inputModalities, videoInputModes, ...modelValues } = values; if (values.capability === "llm") config = { ...config, inputModalities }; if (values.capability === "video") config = { ...config, videoInputModes }; if (await submit({ action: "upsert-model", model: { ...(model !== "new" ? { id: model!.id } : {}), ...modelValues, config } })) setModel(null); })}><Form form={modelForm} layout="vertical"><Form.Item name="providerId" label="渠道" rules={[{ required: true }]}><Select options={catalog.channels.map((item) => ({ value: item.id, label: item.display_name }))} /></Form.Item><Form.Item name="capability" label="能力" rules={[{ required: true }]}><Select options={capabilityOptions} /></Form.Item>{modelCapability === "llm" ? <Form.Item name="inputModalities" label="支持解析的输入" rules={[{ required: true, message: "请选择至少一种输入类型" }]}><Select mode="multiple" options={inputModalityOptions} placeholder="选择模型可解析的内容类型" /></Form.Item> : null}{modelCapability === "video" ? <Form.Item name="videoInputModes" label="支持的视频输入模式" rules={[{ required: true, message: "请选择至少一种视频输入模式" }]}><Select mode="multiple" options={videoInputModeOptions} placeholder="选择首帧、首尾帧或多模态" /></Form.Item> : null}<Form.Item name="modelKey" label="模型标识" rules={[{ required: true }]}><Input /></Form.Item><Form.Item name="displayName" label="显示名称" rules={[{ required: true }]}><Input /></Form.Item><Form.Item name="config" label="其他参数限制 JSON"><Input.TextArea rows={5} /></Form.Item><Space><Form.Item name="enabled" label="启用" valuePropName="checked"><Switch /></Form.Item><Form.Item name="isDefault" label="设为默认" valuePropName="checked"><Switch /></Form.Item></Space></Form></Modal>
            <Modal title={`${pricingModel?.display_name || ""} · 参考价格`} open={Boolean(pricingModel)} onCancel={() => setPricingModel(null)} onOk={() => void pricingForm.validateFields().then(async (pricing) => { if (await submit({ action: "pricing", modelId: pricingModel!.id, pricing })) setPricingModel(null); })}><p className="mb-4 text-sm text-stone-500">币种统一为 CNY，所有费用仅用于内部预估。</p><Form form={pricingForm} layout="vertical"><Form.Item name="input_per_million" label="LLM 输入 / 百万 Token"><InputNumber min={0} className="w-full" /></Form.Item><Form.Item name="output_per_million" label="LLM 输出 / 百万 Token"><InputNumber min={0} className="w-full" /></Form.Item><Form.Item name="per_image" label="图片 / 张"><InputNumber min={0} className="w-full" /></Form.Item><Form.Item name="per_thousand_tokens" label="视频 / 千 Token"><InputNumber min={0} className="w-full" /></Form.Item><Form.Item name="per_10k_characters" label="语音 / 万字符"><InputNumber min={0} className="w-full" /></Form.Item><Form.Item name="per_generation" label="音乐 / 次生成（通常两首）"><InputNumber min={0} className="w-full" /></Form.Item></Form></Modal>
        </AdminPage>
    );
}

function priceLabel(model: ProviderModel) {
    const p = model.pricing;
    if (!p) return "未配置";
    const value = (key: string) => p[key] == null ? "未配置" : `¥${p[key]}`;
    if (model.capability === "llm") return `${value("input_per_million")} / ${value("output_per_million")} 每百万 Token`;
    if (model.capability === "image") return `${value("per_image")}/张`;
    if (model.capability === "video") return `${value("per_thousand_tokens")}/千 Token`;
    if (model.capability === "speech") return `${value("per_10k_characters")}/万字符`;
    return `${value("per_generation")}/次生成`;
}
