import { z } from "zod"

import { messageFactFactory } from "@shop/i18n"

import type { AppKitMessageKey, AppKitParamsByKey } from "../locales/messages.gen"

/** 判空/上限都在 trim 之后；两条用 refine 不用 .min()/.max()（check 通道丢 params，{label} 填不上），消息只发结构化事实 §6.1；maxLength 由调用方给，本文件不复制数字 */
const err = messageFactFactory<Extract<AppKitMessageKey, `form.${string}`>, AppKitParamsByKey>()

export function reasonSchemaOf(label: string, maxLength?: number) {
    const required = z
        .string()
        .trim()
        .refine((value) => value.length > 0, err("form.reasonRequired", { label }))
    return z.object({
        reason:
            maxLength === undefined
                ? required
                : required.refine(
                      (value) => value.length <= maxLength,
                      err("form.reasonMaxLength", { label, max: maxLength }),
                  ),
    })
}
