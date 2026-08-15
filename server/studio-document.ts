type TiptapNode = {
  type?: string;
  text?: string;
  content?: TiptapNode[];
};

/**
 * Convert the compatibility plain-text script into a document that the
 * LumenX editor schema can always open. The editor intentionally disables
 * Tiptap's default paragraph node, so legacy text must use `action` blocks.
 */
export function studioTextToDocument(text: string): Record<string, unknown> {
  if (!text) return { type: "doc", content: [] };

  return {
    type: "doc",
    content: text.split("\n").map((line) => ({
      type: "action",
      ...(line ? { content: [{ type: "text", text: line }] } : {}),
    })),
  };
}

/** Keep `originalText` compatible with the structured Tiptap document. */
export function studioDocumentToText(value: unknown): string {
  return documentNodeText(value as TiptapNode);
}

function documentNodeText(node: TiptapNode | null | undefined): string {
  if (!node || typeof node !== "object") return "";
  if (typeof node.text === "string") return node.text;
  if (!Array.isArray(node.content)) return "";

  const separator = node.type === "doc" ? "\n" : "";
  return node.content.map(documentNodeText).join(separator);
}
