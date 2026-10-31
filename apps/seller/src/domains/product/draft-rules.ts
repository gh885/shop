import type { Money, SellerProductDetail } from "@shop/api/sdk"
import { moneyToYuan } from "@shop/common/domain"

import { countInputSchema, yuanPriceSchema } from "./form"

/**
 * 本域业务规则唯一出口（rules 槽位）：改价/改重量的行换算与 SKU 编辑投影。
 * 建品（规格矩阵、类目属性）暂未落地——新后端的建品契约是「每维一个值」，与旧的
 * 「每维多选 + 自定义值 + 取值配图」不是同一套模型，等专门设计后再回来。
 */

export type SkuEditKind = "price" | "stock"

/** 一条 SKU 的编辑行：原始值(price/weight)与文本并存 */
export interface SkuTextRow {
    skuId: string
    label: string
    price: Money
    priceText: string
    weightText: string
    weight: number | undefined
    status: string
}

/** 规格值拼「 / 」，空值段 filter 掉避免尾分隔符；没有规格值就是单品 */
export function skuLabelOf(sku: Pick<SellerProductDetail["skus"][number], "specs">): string {
    const values = Object.values(sku.specs).filter(Boolean)
    return values.length > 0 ? values.join(" / ") : "单品"
}

// 回显文本由模型值换算（moneyToYuan），不二次解析；输入→值的解析与校验在 form.ts
export function skuTextRowsForEdit(
    skus: readonly SellerProductDetail["skus"][number][],
): SkuTextRow[] {
    return skus.map((s) => ({
        skuId: s.skuId,
        label: skuLabelOf(s),
        price: s.price,
        priceText: moneyToYuan(s.price),
        weightText: s.weightG == null ? "" : String(s.weightG),
        weight: s.weightG ?? undefined,
        status: s.status,
    }))
}

/**
 * 表单行 → 改 SKU 请求体。后端是全量替换语义：**没给的 SKU 一律停售**，
 * 所以每一行都要带上（含未改的），不能只发改动过的。
 *
 * <p>改价模式可以同时改重量；改重量模式只动重量、价格原样回传。
 */
export function toSkuUpdateItemsFromText(
    kind: SkuEditKind,
    rows: readonly SkuTextRow[],
): { skuId: string; price: Money; weightG?: number; status: string }[] {
    return rows.map((r) => {
        if (kind === "price") {
            return {
                skuId: r.skuId,
                price: yuanPriceSchema.parse(r.priceText),
                weightG:
                    r.weightText.trim() === "" ? undefined : countInputSchema.parse(r.weightText),
                status: r.status,
            }
        }
        return {
            skuId: r.skuId,
            price: r.price,
            weightG: r.weightText.trim() === "" ? undefined : countInputSchema.parse(r.weightText),
            status: r.status,
        }
    })
}
