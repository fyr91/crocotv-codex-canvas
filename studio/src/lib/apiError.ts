/** Return the server-provided reason instead of Axios's generic status text. */
export function apiErrorMessage(error: unknown, fallback = "未知错误"): string {
  const responseData = objectValue(objectValue(error).response).data;
  if (typeof responseData === "string" && responseData.trim()) return responseData.trim();
  const payload = objectValue(responseData);
  for (const value of [payload.detail, payload.error, payload.message]) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  return fallback;
}

function objectValue(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}
