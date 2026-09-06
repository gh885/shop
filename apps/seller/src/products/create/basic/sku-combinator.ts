import type { CategoryAttrTemplateNode, SpecSelection } from "../../data"

import type { SkuDraftRow } from "./product-form-state"

interface SpecValueDraft {
    valueId?: string
    value: string
}

/** 按模板维度顺序解析选择 → 各维度取值数组；自定义值文本无 valueId */
function resolveDimensionValues(
    template: CategoryAttrTemplateNode[],
    selections: SpecSelection[],
): SpecValueDraft[][] {
    return template.map((node) => {
        const sel = selections.find((s) => s.attrId === node.attr.id)
        if (!sel) return []
        const fromValueIds = (sel.valueIds ?? [])
            .map((vid) => {
                const v = node.values.find((x) => x.id === vid)
                return v ? ({ valueId: v.id, value: v.value } as SpecValueDraft) : undefined
            })
            .filter((x): x is SpecValueDraft => Boolean(x))
        const fromCustom = (sel.customValues ?? [])
            .map((cv) => cv.trim())
            .filter(Boolean)
            .map((cv) => ({ value: cv }) as SpecValueDraft)
        return [...fromValueIds, ...fromCustom]
    })
}

/** 各维度取值做笛卡尔积：返回全部组合（每组合是「维度下标 → 取值」的数组） */
function cartesianValues(dimensions: SpecValueDraft[][]): SpecValueDraft[][] {
    let result: SpecValueDraft[][] = [[]]
    for (const dim of dimensions) {
        if (dim.length === 0) continue
        const next: SpecValueDraft[][] = []
        for (const prefix of result) {
            for (const v of dim) {
                next.push([...prefix, v])
            }
        }
        result = next
    }
    return result
}

/**
 * 前端按「模板 + 选值」本地算出 SKU 组合行（完全显式模式：不调后端、不建档）。
 *
 * - 无任何选值 → 单规格 1 行（label=「单规格」，spu 名可能为空故不用 spu 拼接）
 * - 有选值 → 各维度取值笛卡尔积，label 用取值文本「 / 」拼接
 * - skuId：新建态无（留空，保存时后端回填）；编辑态由调用方按组合匹配带回
 * - 价格/库存/编码/状态初始为空/0/默认，用户填了再保存
 */
export function buildSkuRowsFromSelections(
    template: CategoryAttrTemplateNode[],
    selections: SpecSelection[],
): SkuDraftRow[] {
    const dimensions = resolveDimensionValues(template, selections)
    const hasSelection = dimensions.some((d) => d.length > 0)
    if (!hasSelection) {
        return [
            {
                skuId: "",
                label: "单规格",
                priceText: "",
                stockText: "",
                skuCode: "",
                status: "ON_SALE",
            },
        ]
    }
    return cartesianValues(dimensions).map((combo) => ({
        skuId: "",
        label: combo.map((v) => v.value).join(" / ") || "单规格",
        priceText: "",
        stockText: "",
        skuCode: "",
        status: "ON_SALE",
    }))
}
