import { z } from "zod"

/**
 * 自由文本「理由」表单的校验（ReasonForm 的状态机之外那半：什么算填了、多长算超）。
 *
 * 从 `reason-form.tsx` 抽出来的原因：这段判据一行都不需要 React，留在 tsx 里就只能靠渲染才测得到
 * ——而「先 trim 再判空、上限按 trim 之后的长度算」恰恰是最容易被顺手改掉的一条。
 *
 * `maxLength` 由调用方给（各条线落库那一格宽度不同，`NOTE_MAX` 等 owner 在 @shop/common），
 * 本文件不复制任何数字。
 */
export function reasonSchemaOf(label: string, maxLength?: number) {
    return z.object({
        reason: z
            .string()
            .trim()
            .min(1, `请填写${label}`)
            .refine((value) => maxLength === undefined || value.length <= maxLength, {
                message: `${label}最长 ${maxLength} 字`,
            }),
    })
}
