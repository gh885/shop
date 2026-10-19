import type {
    CategoryAttrNodeResponse,
    CreateProductRequest,
    SkuResponse,
    SkuUpdateItem,
    SpecSelectionRequest,
    UpdateProductRequest,
} from "@shop/api/sdk"
import { type Money, maxMoney, minMoney, moneyToYuan } from "@shop/common/domain"

import { countInputSchema, yuanPriceSchema } from "./form"

/** 本域业务规则唯一出口（rules 槽位）：商品草稿的判定与不依赖语言的推导。表单契约（输入 schema、单元格解析）在 form.ts，校验消息 key 表在 constants.ts，模型值→文案在 display.ts，wire→视图在本文件的行换算 */

// 值类型（能派生的派生自 SDK，只补本地新增语义）；表单默认值 EMPTY_PRODUCT_BASIC_FORM 在 form.ts
export type ProductBasicForm = Required<
    Pick<UpdateProductRequest, "name" | "subtitle" | "images" | "detailImages" | "sevenDayReturn">
>

export type SpecSelection = Required<
    Pick<SpecSelectionRequest, "attrId" | "valueIds" | "customValues">
> &
    Pick<SpecSelectionRequest, "valueImages" | "customValueImages">

export interface ValueDraft {
    id: string
    valueId?: string
    value: string
    image?: string
    // note 仅 UI 占位，后端取值无此字段，上抛时故意丢弃
    note: string
}

export interface AttrDraft {
    attrId: string
    name: string
    allowCustom: boolean
    allowImage: boolean
    values: CategoryAttrNodeResponse["values"]
    rows: ValueDraft[]
}

// 行 id 只做 React key 与异步上传定位，不进载荷；用闭包计数而非模块级单例（多处使用会互相吞号）
export function createValueRowId(): () => string {
    let seq = 0
    return () => `v-${++seq}`
}

export function selectionsToDrafts(
    nodes: CategoryAttrNodeResponse[],
    selected: SpecSelection[],
    nextId: () => string,
): AttrDraft[] {
    return nodes.map((n) => {
        const sel = selected.find((s) => s.attrId === n.attr.id)
        const valueById = new Map(n.values.map((v) => [v.id, v]))
        const rows: ValueDraft[] = []
        for (const vid of sel?.valueIds ?? []) {
            const v = valueById.get(vid)
            rows.push({
                id: nextId(),
                valueId: vid,
                value: v?.value ?? "",
                image: sel?.valueImages?.[vid],
                note: "",
            })
        }
        for (const cv of sel?.customValues ?? []) {
            rows.push({ id: nextId(), value: cv, image: sel?.customValueImages?.[cv], note: "" })
        }
        if (rows.length === 0) rows.push({ id: nextId(), value: "", note: "" })
        return {
            attrId: n.attr.id,
            name: n.attr.name,
            allowCustom: n.attr.allowCustom,
            allowImage: n.attr.allowImage,
            values: n.values,
            rows,
        }
    })
}

// 整维度无取值则不回传（后端把空选择当非法输入）；取值图只收「有值且有图」的，空对象省略为 undefined
export function draftsToSelections(drafts: AttrDraft[]): SpecSelection[] {
    const withRows = drafts.filter((d) => d.rows.some((r) => r.value.trim()))
    return withRows.map((d) => {
        const valueIds = d.rows
            .filter(
                (r): r is ValueDraft & { valueId: string } => !!r.valueId && r.value.trim() !== "",
            )
            .map((r) => r.valueId)
        const customValues = d.rows
            .filter((r) => !r.valueId && r.value.trim())
            .map((r) => r.value.trim())
        const valueImages: Record<string, string> = {}
        for (const r of d.rows)
            if (r.valueId && r.value.trim() && r.image) valueImages[r.valueId] = r.image
        const customValueImages: Record<string, string> = {}
        for (const r of d.rows) {
            const v = r.value.trim()
            if (!r.valueId && v && r.image) customValueImages[v] = r.image
        }
        return {
            attrId: d.attrId,
            valueIds,
            customValues,
            valueImages: Object.keys(valueImages).length > 0 ? valueImages : undefined,
            customValueImages:
                Object.keys(customValueImages).length > 0 ? customValueImages : undefined,
        }
    })
}

export type ListingTime = "now" | "warehouse"

export interface SkuDraftRow {
    skuId: string | null
    label: string
    // null = 未设价（≠ 0 元）；保存门槛与发送只认非 null
    price: SkuResponse["price"]
    // null = 未填，发送投影时才 ?? 0（模型不存 0 哨兵）
    stock: number | null
    skuCode: SkuResponse["skuCode"]
    status: SkuResponse["status"]
}

// 新建态本地行 skuId=null 无法按 id 匹配，改按组合 label（与后端行同构）搬回已填值；规则同 mergeSkuRows
function blankDraftRow(label: string): SkuDraftRow {
    // oxlint-disable-next-line no-null -- 模型契约存 null（null=未填，非 0 哨兵）
    return { skuId: null, label, price: null, stock: null, skuCode: null, status: "ON_SALE" }
}

interface SpecValueDraft {
    valueId?: string
    value: string
}

function resolveDimensionValues(
    template: CategoryAttrNodeResponse[],
    selections: SpecSelection[],
): SpecValueDraft[][] {
    return template.map((node) => {
        const sel = selections.find((s) => s.attrId === node.attr.id)
        if (!sel) return []
        const fromValueIds = sel.valueIds.flatMap((vid) => {
            const v = node.values.find((x) => x.id === vid)
            return v ? [{ valueId: v.id, value: v.value }] : []
        })
        const fromCustom = sel.customValues
            .map((cv) => cv.trim())
            .filter(Boolean)
            .map((cv) => ({ value: cv }))
        return [...fromValueIds, ...fromCustom]
    })
}

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

export function buildSkuRowsFromSelections(
    template: CategoryAttrNodeResponse[],
    selections: SpecSelection[],
): SkuDraftRow[] {
    const dimensions = resolveDimensionValues(template, selections)
    if (!dimensions.some((d) => d.length > 0)) {
        return [blankDraftRow(SKU_LABEL_SINGLE)]
    }
    return cartesianValues(dimensions).map((combo) =>
        blankDraftRow(combo.map((v) => v.value).join(" / ")),
    )
}

// 值是 catalog key（非某句中文）：兼作 merge 与搜索的匹配键，必须语言无关且稳定。出文案（t 成当前语言）在 display.ts 的 skuDisplayLabel
export const SKU_LABEL_SINGLE = "product.sku.singleSpec" as const

// 用 attributes 快照拼「 / 」，不用 s.name（那是 SPU名+规格值，会把商品名重复一遍）；空值段 filter 掉避免尾分隔符
export function skuLabelOf(sku: Pick<SkuResponse, "attributes">): string {
    return (
        sku.attributes
            .map((a) => a.value)
            .filter(Boolean)
            .join(" / ") || SKU_LABEL_SINGLE
    )
}

export function rowFromSku(sku: SkuResponse): SkuDraftRow {
    return {
        skuId: sku.id,
        label: skuLabelOf(sku),
        price: sku.price,
        stock: sku.stock,
        skuCode: sku.skuCode,
        status: sku.status === "DISABLED" ? "DISABLED" : "ON_SALE",
    }
}

// 用新网格替换但按 skuId（后端对组合未变的 SKU 复用同 id）保留旧值；覆盖比较用 null 不是 truthiness，显式填的 0 元也保留
export function mergeSkuRows(
    previous: SkuDraftRow[] | undefined,
    fresh: SkuResponse[],
): SkuDraftRow[] {
    const prevById = new Map<string, SkuDraftRow>()
    for (const r of previous ?? []) {
        if (r.skuId !== null) prevById.set(r.skuId, r)
    }
    return fresh.map((sku) => {
        const row = rowFromSku(sku)
        const prev = prevById.get(sku.id)
        if (!prev) return row
        return {
            ...row,
            price: prev.price ?? row.price,
            stock: prev.stock ?? row.stock,
            skuCode: prev.skuCode ?? row.skuCode,
        }
    })
}

export function mergeLocalPricedRows(
    local: SkuDraftRow[],
    serverRows: SkuDraftRow[],
): SkuDraftRow[] {
    const localByLabel = new Map(local.map((r) => [r.label, r]))
    return serverRows.map((serverRow) => {
        const draft = localByLabel.get(serverRow.label)
        if (!draft) return serverRow
        return {
            ...serverRow,
            price: draft.price ?? serverRow.price,
            stock: draft.stock ?? serverRow.stock,
            skuCode: draft.skuCode ?? serverRow.skuCode,
            // status 一律取本地：上下架开关由用户操作决定，不被服务端新行默认覆盖
            status: draft.status,
        }
    })
}

export function unpricedRows(rows: SkuDraftRow[]): SkuDraftRow[] {
    return rows.filter((r) => r.price === null)
}

// sevenDayReturn 恒传：关掉过的不传就等于每次编辑都重新打开（create/update 共用，主图取首图）
export function toBasicPayload(categoryId: string, basic: ProductBasicForm): CreateProductRequest {
    return {
        categoryId,
        name: basic.name,
        subtitle: basic.subtitle || undefined,
        mainImage: basic.images[0],
        images: basic.images,
        detailImages: basic.detailImages,
        sevenDayReturn: basic.sevenDayReturn,
    }
}

// 只发「已设价且已建档」的行：空价不发（草稿无门槛的关键，没设价的 SKU 不写 0）；库存 null→0、编码空→省略
export function toSkuUpdateItems(rows: SkuDraftRow[]): SkuUpdateItem[] {
    return rows.flatMap((r) => {
        if (r.skuId === null || r.price === null) return []
        return [
            {
                skuId: r.skuId,
                price: r.price,
                stock: r.stock ?? 0,
                skuCode: r.skuCode?.trim() || undefined,
                status: r.status,
            },
        ]
    })
}

export type SkuEditKind = "price" | "stock"

// 原始值(price/stock)与文本并存：updateSkus 把价格与库存都当必填绝对量，改一维必须原样回传另一维，漏传等于清零
export interface SkuTextRow {
    skuId: string
    label: string
    price: Money | null
    priceText: string
    stockText: string
    stock: number
    skuCodeText: string
}

// 回显文本由模型值换算（moneyToYuan），不二次解析；输入→值的解析与校验在 form.ts
export function skuTextRowsForEdit(skus: readonly SkuResponse[]): SkuTextRow[] {
    return skus.map((s) => ({
        skuId: s.id,
        label: skuLabelOf(s),
        price: s.price,
        priceText: moneyToYuan(s.price),
        stockText: String(s.stock),
        stock: s.stock,
        skuCodeText: s.skuCode ?? "",
    }))
}

// 库存模式跳过未定价行（null 发出去=把未定价 SKU 写成 0 元）；skuCode 仅价格模式可改且留空=不改
// 文本→数值的换算委托 form.ts 的两个 schema（与单元格校验同一真相源）
export function toSkuUpdateItemsFromText(
    kind: SkuEditKind,
    rows: readonly SkuTextRow[],
): SkuUpdateItem[] {
    return rows.flatMap((r) => {
        const skuCode = r.skuCodeText.trim()
        if (kind === "price") {
            const price = yuanPriceSchema.parse(r.priceText)
            return [{ skuId: r.skuId, price, stock: r.stock, ...(skuCode ? { skuCode } : {}) }]
        }
        if (r.price === null) return []
        return [{ skuId: r.skuId, price: r.price, stock: countInputSchema.parse(r.stockText) }]
    })
}

// 价格只统计已设价的行（未设价不参与，否则区间被 0 拖平）；库存 null→0 计入合计，与 toSkuUpdateItems 同口径
export function derivePriceStock(rows: readonly Pick<SkuDraftRow, "price" | "stock">[]): {
    min: Money | undefined
    max: Money | undefined
    totalStock: number
} {
    const prices = rows.map((r) => r.price).filter((m): m is Money => m !== null)
    return {
        min: minMoney(prices),
        max: maxMoney(prices),
        totalStock: rows.reduce((sum, r) => sum + (r.stock ?? 0), 0),
    }
}

// 返回可见行并带上它在原数组的下标：下标必须跟着行走，编辑/删除都按下标改整份 rows，重排会落到别的 SKU
export function selectVisibleSkuRows(
    rows: readonly SkuDraftRow[],
    keyword: string,
): { row: SkuDraftRow; index: number }[] {
    const all = rows.map((row, index) => ({ row, index }))
    const kw = keyword.trim().toLowerCase()
    if (!kw) return all
    return all.filter(
        ({ row }) =>
            row.label.toLowerCase().includes(kw) || (row.skuCode ?? "").toLowerCase().includes(kw),
    )
}
