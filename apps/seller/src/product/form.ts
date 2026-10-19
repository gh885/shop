import { z } from "zod"

import type { CheckedMessageFact } from "@shop/i18n"
import { type Money, yuanToMoney } from "@shop/common/domain"

import type { ProductBasicForm } from "./draft-rules"
import { SKU_CELL_ERROR } from "./constants"

/** 商品发布/编辑表单的契约（form 槽位）：表单默认值、输入格子的 zod 形状与校验消息事实。判定与推导在 draft-rules.ts，展示词表在 constants.ts，出文案在 display.ts 与调用点 */

// 必须模块级稳定引用：TanStack Form 比较 defaultValues 引用，每渲染新建会在未触碰时把回显值清空
export const EMPTY_PRODUCT_BASIC_FORM: ProductBasicForm = {
    images: [],
    name: "",
    subtitle: "",
    detailImages: [],
    sevenDayReturn: true,
}

// value=null=清空、error 有值=格式非法：两者必须分开，否则非法输入被当成删值、价格凭空消失
export interface CellParse<T> {
    value: T | null
    error?: CheckedMessageFact
}

export const yuanPriceSchema = z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,2})?$/, SKU_CELL_ERROR.price.message)
    // 换算委托 yuanToMoney（唯一真相源）；regex 保证格式后 z.custom 仅做运行时收口/类型收窄，
    // 不用契约的 zMoney（它把 int64 校成 bigint）
    .transform((v) => yuanToMoney(v))
    .pipe(z.custom<Money>((v) => v !== undefined, SKU_CELL_ERROR.price.message))

export const countInputSchema = z
    .string()
    .trim()
    .regex(/^\d+$/, SKU_CELL_ERROR.count.message)
    .transform(Number)

function parseCell<T>(
    raw: string,
    schema: z.ZodType<T, string>,
    error: CheckedMessageFact,
): CellParse<T> {
    const text = raw.trim()
    if (text === "") return { value: null }
    const parsed = schema.safeParse(text)
    // 复用 schema 的消息事实，不从 Zod issue 反查（issue 只带字符串文本，会丢 i18n）
    return parsed.success ? { value: parsed.data } : { value: null, error }
}

export function parsePriceCell(raw: string): CellParse<Money> {
    return parseCell(raw, yuanPriceSchema, SKU_CELL_ERROR.price)
}

export function parseCountCell(raw: string): CellParse<number> {
    return parseCell(raw, countInputSchema, SKU_CELL_ERROR.count)
}

// 空 = 不覆盖（区别于单元格「空=清空」）；任一格非法则整批不落，不写半批价格
export function parseBatchFill(
    priceText: string,
    stockText: string,
): { price?: Money; stock?: number; error?: CheckedMessageFact } {
    const price = parsePriceCell(priceText)
    if (price.error) return { error: price.error }
    const stock = parseCountCell(stockText)
    if (stock.error) return { error: stock.error }
    return { price: price.value ?? undefined, stock: stock.value ?? undefined }
}
