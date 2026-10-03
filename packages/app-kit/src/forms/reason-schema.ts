import { z } from "zod"

import { messageFactFactory } from "@shop/common/i18n"

import type { AppKitMessageKey, AppKitParamsByKey } from "../locales/messages.gen"

/**
 * 自由文本「理由」表单的校验（ReasonForm 的状态机之外那半：什么算填了、多长算超）。
 *
 * 从 `reason-form.tsx` 抽出来的原因：这段判据一行都不需要 React，留在 tsx 里就只能靠渲染才测得到
 * ——而「先 trim 再判空、上限按 trim 之后的长度算」恰恰是最容易被顺手改掉的一条。
 *
 * `maxLength` 由调用方给（各条线落库那一格宽度不同，`NOTE_MAX` 等 owner 在 @shop/common），
 * 本文件不复制任何数字。
 *
 * 消息只发**结构化事实**（§6.1）：`message` 是 catalog key，字段名 `label` 与上限 `max` 作为
 * `params` 出——句子留在 catalog，不在此拼模板串。两条都是 `refine` 而非 `.min()`/`.max()`：
 * check 通道会把 `params` 丢掉，`{label}` 就填不上（`withMaxLength` 的头注释记着这条实测）。
 *
 * `label` 仍是入参而不是 key，因为「拒绝理由 / 取消原因 / 备注」这些名字由各 app 的 catalog 给
 * （§4.1：本包不持有各业务线的字段名），调用方 `t` 好了再传——与本文件迁移前一致。
 */
const err = messageFactFactory<
    Extract<AppKitMessageKey, `appKit.form.${string}`>,
    AppKitParamsByKey
>()

export function reasonSchemaOf(label: string, maxLength?: number) {
    const required = z
        .string()
        .trim()
        .refine((value) => value.length > 0, err("appKit.form.reasonRequired", { label }))
    return z.object({
        reason:
            maxLength === undefined
                ? required
                : required.refine(
                      (value) => value.length <= maxLength,
                      err("appKit.form.reasonMaxLength", { label, max: maxLength }),
                  ),
    })
}
