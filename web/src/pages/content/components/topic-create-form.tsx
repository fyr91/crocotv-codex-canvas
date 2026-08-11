import { Form, Input, Radio, Select, type FormInstance } from "antd";

export type TopicCreateValues = {
    title: string;
    originalTopic: string;
    creationNotes: string;
    tags: string[];
    claim: boolean;
};

export const topicCreateInitialValues: TopicCreateValues = { title: "", originalTopic: "", claim: true, tags: [], creationNotes: "" };

export function TopicCreateForm({ form, claimMode }: { form: FormInstance<TopicCreateValues>; claimMode: "choice" | "required" }) {
    return (
        <Form<TopicCreateValues> form={form} layout="vertical" initialValues={topicCreateInitialValues} requiredMark={false}>
            <Form.Item name="title" label="Topic 标题" rules={[{ required: true, whitespace: true, message: "请填写 Topic 标题" }]}>
                <Input placeholder="用于团队快速识别的标题" />
            </Form.Item>
            <Form.Item name="originalTopic" label="Topic 描述" rules={[{ required: true, whitespace: true, message: "请填写 Topic 描述" }]}>
                <Input.TextArea autoSize={{ minRows: 4, maxRows: 8 }} placeholder="描述希望探索的内容和方向，不需要先写成完整脚本" />
            </Form.Item>
            <Form.Item name="creationNotes" label="创建说明">
                <Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} placeholder="为什么现在值得做、希望关注什么" />
            </Form.Item>
            <Form.Item name="tags" label="Tag">
                <Select mode="tags" tokenSeparators={[",", "，"]} placeholder="输入任意 Tag 后回车" />
            </Form.Item>
            {claimMode === "choice" ? (
                <Form.Item name="claim" label="提交方式">
                    <Radio.Group optionType="button" buttonStyle="solid">
                        <Radio.Button value>创建并领取</Radio.Button>
                        <Radio.Button value={false}>仅加入公共池</Radio.Button>
                    </Radio.Group>
                </Form.Item>
            ) : null}
        </Form>
    );
}
