import { z } from "zod"
import { type Money, yuanToMoney } from "@shop/common"

import type {
    CategoryAttrNodeResponse,
    CreateProductRequest,
    SkuResponse,
    SkuUpdateItem,
    SpecSelectionRequest,
    UpdateProductRequest,
} from "@shop/api/sdk"

/**
 * 商品发布草稿的「编辑行模型」——值类型 + 纯函数，不碰 React / 网络。
 *
 * 设计原则（回应过量的类型与空值兜底）：
 * 1. **能派生的类型不手写**：与 wire 同形状的字段一律从 SDK 类型派生
 *    （Required<Pick<…>> / T["field"] / 直接别名），手写只补本地新增语义
 *    （label 快照、skuId 未建档为 null、stock 可未填为 null）。
 * 2. **模型只存 Money 与 null，不存字符串**：金额换算（分↔元）发生在 UI 输入/展示
 *    边界（SkuGridEditor），0 兜底发生在 wire 投影（toSkuUpdateItems）——
 *    模型与 merge 里没有 Number(text)/trim/||0 这类魔法。
 *    null = 未设置（区别于 0：0 元是合法价，price!==null 才可保存）。
 * 3. **兜底只在边界做一次**：wire 契约的 optional/nullable 由各投影归一；
 *    行内不再用 "" 哨兵，判断一律 null 比较。
 *
 * 文件内聚：类型 + 笛卡尔积组合 + 行投影/合并 + 保存载荷（均纯函数，可单测）。
 */

// 值类型（能派生的派生，只写本地语义）
/** 表单编辑的「基本信息」字段（白名单派生自 UpdateProductRequest，其余字段服务端生成/推导） */
export type ProductBasicForm = Required<
    Pick<UpdateProductRequest, "name" | "subtitle" | "images" | "detailImages">
>

/**
 * 一个销售属性的选择：契约同 SpecSelectionRequest，valueIds/customValues 在本流程
 * 永远成对给数组（收紧必填免去各调用点 ?? []），不做手写镜像。
 */
export type SpecSelection = Required<
    Pick<SpecSelectionRequest, "attrId" | "valueIds" | "customValues">
>

/**
 * 上架时间：决定「提交商品信息」落哪个状态（now → 发布 PUBLISHED；warehouse → WAREHOUSE；
 * 定时上架 scheduled 本轮不做）。纯前端流程语义，无 wire 对应，保留字面量联合。
 */
export type ListingTime = "now" | "warehouse"

/**
 * SKU 网格行（编辑工作区镜像，值域与 SkuResponse 同形状——金额就是 Money）。
 * 字段尽量从 SkuResponse 派生（status/skuCode/price 类型随契约自动同步）；
 * 本地语义只有：skuId null = 未建档组合、stock null = 未填（wire 必填，发送时 ?? 0）。
 */
export interface SkuDraftRow {
    /** 已建档 SKU 的 id；本地新建组合行 null（保存后由后端回填，稳定键用于匹配回填） */
    skuId: string | null
    /** 规格组合显示名，SKU 生成时快照 */
    label: string
    /** 单价（Money）；null = 未设价（≠ 0 元：保存门槛与发送只认非 null） */
    price: SkuResponse["price"]
    /** 库存（件）；null = 未填（发送投影时才 ?? 0，模型不存魔法 0） */
    stock: number | null
    /** 商家编码；null = 无（trim/省略在 wire 投影边界） */
    skuCode: SkuResponse["skuCode"]
    status: SkuResponse["status"]
}

// 单元格输入规则（元文本 → 分；单元格/批量填写共用）
/**
 * 价格单元格的输入格式：非负「元」、最多两位小数 → Money。
 *
 * 只验格式 + 换算，**空串不在 schema 内**——空 = 用户清空（置 null）是产品语义，
 * 由调用方先判空再校验；非法输入由此与清空区分开（UI 提示而不静默丢值）。
 */
export const yuanPriceSchema = z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,2})?$/, "价格需为非负数字，最多两位小数")
    // 换算委托 yuanToMoney（唯一真相源，币种取平台定价币种）；regex 已保证格式，
    // undefined 分支不可达，这里只做一次运行时收口与类型收窄（不用契约的 zMoney：它把 int64 校成 bigint）
    .transform((v) => yuanToMoney(v))
    .pipe(z.custom<Money>((v) => v !== undefined, "价格格式不正确"))

/** 库存/数量单元格输入：非负整数（换算就是 Number，格式保证后直接取） */
export const countInputSchema = z
    .string()
    .trim()
    .regex(/^\d+$/, "数量需为非负整数")
    .transform(Number)

// 行构造
/** 空白行（新建态组合/单规格共用一份默认值，避免各处手写 {price:null…}） */
function blankDraftRow(label: string): SkuDraftRow {
    // oxlint-disable-next-line no-null -- 设计契约：模型存 null（见文件头「模型只存分与 null」，rowFromSku 不对 wire null 归一）
    return { skuId: null, label, price: null, stock: null, skuCode: null, status: "ON_SALE" }
}

// SKU 组合：模板选值 → 笛卡尔积行（新建态完全显式，不调后端不建档）
interface SpecValueDraft {
    valueId?: string
    value: string
}

/** 按模板维度顺序解析选择 → 各维度取值数组；自定义值文本无 valueId */
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
 * - 无任何选值 → 单规格 1 行（label=「单规格」）；有选值 → 各维度取值笛卡尔积，
 *   label 用取值文本「 / 」拼接（组合非空，无兜底分支）
 * - skuId null（保存时后端回填）；价格/库存/编码均未设（用户填了再保存）
 */
export function buildSkuRowsFromSelections(
    template: CategoryAttrNodeResponse[],
    selections: SpecSelection[],
): SkuDraftRow[] {
    const dimensions = resolveDimensionValues(template, selections)
    if (!dimensions.some((d) => d.length > 0)) {
        return [blankDraftRow("单规格")]
    }
    return cartesianValues(dimensions).map((combo) =>
        blankDraftRow(combo.map((v) => v.value).join(" / ")),
    )
}

// 行投影与合并（服务端行 ↔ 编辑行）
/** 服务端 SKU → 编辑行：label 拼规格名；金额不换算（模型即「分」），可空字段原样透传 */
export function rowFromSku(sku: SkuResponse): SkuDraftRow {
    return {
        skuId: sku.id,
        label: sku.attributes.map((a) => a.value).join(" / ") || "单规格",
        price: sku.price,
        stock: sku.stock,
        skuCode: sku.skuCode,
        status: sku.status === "DISABLED" ? "DISABLED" : "ON_SALE",
    }
}

/**
 * 选值变化 → 服务端重新生成 SKU → 用新网格替换，但**保留未变 SKU 已填的价格/库存/编码**。
 * 后端 updateSpecs 对「组合没变的 SKU」复用同一 id（稳定键），按 skuId 匹配即可带回旧值。
 * 覆盖规则用 null 比较（不是 truthiness）：用户显式填过 0 元也会保留。
 */
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
        // 用户未设（null）的字段用服务端回填值，已设（含 0）的保留用户输入
        return {
            ...row,
            price: prev.price ?? row.price,
            stock: prev.stock ?? row.stock,
            skuCode: prev.skuCode ?? row.skuCode,
        }
    })
}

/**
 * 保存时把「本地行已填的值」按组合 label merge 到「后端生成的带 skuId 行」上。
 * 新建态本地行 skuId 为 null 无法按 id 匹配，但组合 label（取值文本「 / 」拼接）与
 * 后端行 label 同构，故按 label 匹配搬回已填值（规则同 mergeSkuRows：null 用后端值）。
 */
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
            // 上/下架开关由用户本地操作决定：服务端新行默认态被本地行覆盖
            status: draft.status,
        }
    })
}

// 保存门槛与 wire 载荷（边界投影）
/** 发布门槛只读守卫：未设价的 SKU 行（提交/入库前必须补全；草稿模式可跳过） */
export function unpricedRows(rows: SkuDraftRow[]): SkuDraftRow[] {
    return rows.filter((r) => r.price === null)
}

/** basic 表单值 → 商品基本信息载荷（create/update 两入口共用；主图取首图；空值不传由 wire optional 表达） */
export function toBasicPayload(categoryId: string, basic: ProductBasicForm): CreateProductRequest {
    return {
        categoryId,
        name: basic.name,
        subtitle: basic.subtitle || undefined,
        mainImage: basic.images[0],
        images: basic.images,
        detailImages: basic.detailImages,
    }
}

/**
 * 只回传「已设价且已建档」的 SKU 行（空价不发——草稿无门槛的关键：没设价的 SKU 不写 0）。
 * 边界兜底只在这里做一次：库存 null → 0（产品决策：没填库存的 SKU 落 0）、编码 trim 后空 → 省略。
 */
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
