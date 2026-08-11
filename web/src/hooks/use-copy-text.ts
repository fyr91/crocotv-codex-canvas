import { App } from "antd";
import copy from "copy-to-clipboard";
import { useCallback } from "react";

export function useCopyText() {
    const { message } = App.useApp();

    return useCallback(async (value: string, successText = "已复制") => {
        let copied = false;
        try {
            await navigator.clipboard.writeText(value);
            copied = true;
        } catch {
            copied = copy(value);
        }

        if (copied) {
            message.success(successText);
        } else {
            message.error("复制失败，请重试");
        }
        return copied;
    }, [message]);
}
