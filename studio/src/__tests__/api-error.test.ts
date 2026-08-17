import { describe, expect, it } from "vitest";
import { apiErrorMessage } from "@/lib/apiError";

describe("apiErrorMessage", () => {
  it("prefers backend detail and error fields over the generic Axios message", () => {
    expect(apiErrorMessage({
      message: "Request failed with status code 500",
      response: { data: { detail: "模型响应格式无效" } },
    })).toBe("模型响应格式无效");
    expect(apiErrorMessage({
      message: "Request failed with status code 409",
      response: { data: { error: "画布已更新，请重新提交" } },
    })).toBe("画布已更新，请重新提交");
  });

  it("falls back to Error.message and a stable fallback", () => {
    expect(apiErrorMessage(new Error("Network Error"))).toBe("Network Error");
    expect(apiErrorMessage(null, "请求失败")).toBe("请求失败");
  });
});
