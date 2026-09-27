import { z } from "zod"
import { type Money, maxMoney, minMoney, moneyToYuan, yuanToMoney } from "@shop/common"

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
 *    边界（SkuGridEditor），单元格文本的「空 = 清空 / 非法 = 提示」判据由本文件的 parse*Cell 给
 *    （0 兜底发生在 wire 投影 toSkuUpdateItems）——
 *    模型与 merge 里没有 Number(text)/trim/||0 这类魔法。
 *    null = 未设置（区别于 0：0 元是合法价，price!==null 才可保存）。
 * 3. **兜底只在边界做一次**：wire 契约的 optional/nullable 由各投影归一；
 *    行内不再用 "" 哨兵，判断一律 null 比较。
 *
 * 文件内聚：类型 + 销售属性取值行换算 + 笛卡尔积组合 + 行投影/合并 + 保存载荷 + 派生展示（均纯函数，可单测）。
 */

// 值类型（能派生的派生，只写本地语义）
/** 表单编辑的「基本信息」字段（白名单派生自 UpdateProductRequest，其余字段服务端生成/推导）。
 *  sevenDayReturn 在这一格里是因为它是商品的一次性声明（法定默认支持，特殊类目才关），跟着基本信息一起存 */
export type ProductBasicForm = Required<
    Pick<UpdateProductRequest, "name" | "subtitle" | "images" | "detailImages" | "sevenDayReturn">
>

/**
 * 空白 basic 表单值：须为**模块级稳定引用**。
 *
 * TanStack Form 的 `update()` 每次渲染比较 `defaultValues` 引用：引用变了且表单未被触碰（`!isTouched`），
 * 它会把 values 重置回 defaultValues——若这里是每渲染新建的字面量，编辑回显 `form.reset(initialBasic)`
 * 填进去的值会在下一帧被清空（「出现一下就没」）。类型锚点与发布步骤曾各抄一份同样的字面量，
 * 加字段时只改一处就会让另一处的默认值悄悄缺项，故这里只留一份。
 */
export const EMPTY_PRODUCT_BASIC_FORM: ProductBasicForm = {
    images: [],
    name: "",
    subtitle: "",
    detailImages: [],
    sevenDayReturn: true,
}

/**
 * 一个销售属性的选择：契约同 SpecSelectionRequest，valueIds/customValues 在本流程
 * 永远成对给数组（收紧必填免去各调用点 ?? []），不做手写镜像。
 * 取值图（valueImages/customValueImages）保持可选：编辑回显要靠它灌回图片，否则重进编辑图就丢了。
 */
export type SpecSelection = Required<
    Pick<SpecSelectionRequest, "attrId" | "valueIds" | "customValues">
> &
    Pick<SpecSelectionRequest, "valueImages" | "customValueImages">

/**
 * 一个「取值行」的草稿形状：id 稳定拼接；命中模板值记 valueId，否则视为自定义值。
 *
 * 它住在模型层而不是行组件里，是因为 `SpecSelection`（契约形状）与它之间的换算就是本域的规则：
 * 组件只渲染一行，凭什么决定「一行回显成几行、空行算不算选择」。
 */
export interface ValueDraft {
    id: string
    /** 命中模板值的 id；无 = 自定义值 */
    valueId?: string
    value: string
    /** 取值图（如颜色所对应的色块图）；本期仅 UI 占位，后端取值模型暂无该字段，提交时丢弃 */
    image?: string
    /** 备注：本期仅 UI 占位，后端取值无该字段，提交时丢弃 */
    note: string
}

/** 一个销售属性维度（模板 + 它的取值行）。`values` 是模板值域，供输入框做 autocomplete */
export interface AttrDraft {
    attrId: string
    name: string
    allowCustom: boolean
    /** 该规格是否允许每个取值上传配图（后端类目模板 allow_image） */
    allowImage: boolean
    values: CategoryAttrNodeResponse["values"]
    rows: ValueDraft[]
}

/**
 * 取值行 id 工厂：闭包计数，不用模块级单例。
 *
 * 行 id 只做 React key 与「异步上传回来时找哪一行」的定位符（见 SalesAttrsEditor 的 updateImage），
 * 不进载荷。模块级 `let seq` 在同一模块被多处用到时会互相吞号，所以把计数器交给调用方持有。
 */
export function createValueRowId(): () => string {
    let seq = 0
    return () => `v-${++seq}`
}

/**
 * 契约选择 → 编辑行（编辑回显方向）。
 *
 * 模板取值按 id 建一次索引再取值，避免对每个已选值线性扫 `values`；模板里找不到的 id
 * （类目模板改过）仍建行回显，只是取不到文本——留着它，用户才会看到「这里有个值要重新选」，
 * 而不是静默丢一个规格维度。每个维度至少留一个空行，否则新建态无从下手。
 */
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

/**
 * 编辑行 → 契约选择（上抛方向）。
 *
 * 「一个值都没填」的维度整条不回传——后端把空 customValues 当非法输入，而用户删光取值
 * 意思是「这个维度不要了」。取值图只收「有值且有图」的，随选择上抛后由后端落到
 * `category_attr_values.image`；两边都空的对象省略（`?? undefined`），不给 wire 发 `{}`。
 */
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

/** 单元格文本的解析结果：`value=null` 是「清空」，`error` 有值才是「格式不对」——两者必须分得开，
 *  否则用户敲了个非法值会被当成删掉，价格凭空消失 */
export interface CellParse<T> {
    value: T | null
    error?: string
}

function parseCell<T>(raw: string, schema: z.ZodType<T, string>): CellParse<T> {
    const text = raw.trim()
    if (text === "") return { value: null }
    const parsed = schema.safeParse(text)
    if (!parsed.success) return { value: null, error: parsed.error.issues[0]?.message }
    return { value: parsed.data }
}

/** 价格单元格：元文本 → Money（失焦才走这里，编辑中途不打断输入） */
export function parsePriceCell(raw: string): CellParse<Money> {
    return parseCell(raw, yuanPriceSchema)
}

/** 数量单元格：件文本 → 整数 */
export function parseCountCell(raw: string): CellParse<number> {
    return parseCell(raw, countInputSchema)
}

/**
 * 「批量填写」的两次解析：只覆盖填了的那一维，空的不覆盖（区别于单元格的「空 = 清空」——
 * 批量清空价格从来不是意图）。任一格非法则整批不落，避免半批价格写进去。
 */
export function parseBatchFill(
    priceText: string,
    stockText: string,
): { price?: Money; stock?: number; error?: string } {
    const price = parsePriceCell(priceText)
    if (price.error) return { error: price.error }
    const stock = parseCountCell(stockText)
    if (stock.error) return { error: stock.error }
    return { price: price.value ?? undefined, stock: stock.value ?? undefined }
}

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
        return [blankDraftRow(SKU_LABEL_SINGLE)]
    }
    return cartesianValues(dimensions).map((combo) =>
        blankDraftRow(combo.map((v) => v.value).join(" / ")),
    )
}

// 行投影与合并（服务端行 ↔ 编辑行）
/** 无规格值时的行名。全站一个词：它曾在发布网格是「单规格」、在「编辑 SKU」弹窗是「默认规格」，
 *  同一个 SKU 在两个界面两个名字 */
export const SKU_LABEL_SINGLE = "单规格"

/**
 * SKU 展示名：规格值快照用「 / 」拼接，空快照 = 单规格。
 *
 * 不用 `s.name`——那是「SPU名+规格值」的拼接快照，拼进表格里会把商品名重复一遍。
 * 空值段先 `filter(Boolean)`：属性位还在但值为空（类目模板改过）不该留下 `A / ` 这样的尾分隔符。
 */
export function skuLabelOf(sku: Pick<SkuResponse, "attributes">): string {
    return (
        sku.attributes
            .map((a) => a.value)
            .filter(Boolean)
            .join(" / ") || SKU_LABEL_SINGLE
    )
}

/** 服务端 SKU → 编辑行：label 拼规格名；金额不换算（模型即「分」），可空字段原样透传 */
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

/** basic 表单值 → 商品基本信息载荷（create/update 两入口共用；主图取首图；空值不传由 wire optional 表达）。
 *  sevenDayReturn 恒传：它是「默认支持、特殊类目才关」的开关，不传就等于每次编辑都把关掉过的重新打开 */
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

// 「编辑 SKU / 编辑库存」弹窗：服务端 SKU ↔ 文本态行 ↔ wire
/** 弹窗一次只改一个维度：价格（连带商家编码）或库存 */
export type SkuEditKind = "price" | "stock"

/**
 * 弹窗里可变的一行：价格/库存/编码都以文本态承接输入，提交时才统一换算校验。
 *
 * 原始值（price/stock）与文本并存，因为 `updateSkus` 把价格和库存都当**必填绝对量**：
 * 编辑价格时要原样回传库存、编辑库存时要原样回传价格，漏传等于把另一维清零。
 */
export interface SkuTextRow {
    skuId: string
    label: string
    /** 当前价格（Money），未定价为 null —— 编辑库存时需原样回传，故必存原始值 */
    price: Money | null
    priceText: string
    stockText: string
    /** 当前库存（编辑价格时原样回传，避免绝对量被误清零） */
    stock: number
    skuCodeText: string
}

/** 服务端 SKU → 弹窗行（回显方向）：文本由模型值格式化而来，不做二次解析 */
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

/**
 * 弹窗行 → wire 载荷（提交方向）。
 *
 * 只回传已定价的行：库存模式的价格是「原样回传的绝对量」，`null` 发出去就是把未定价的 SKU
 * 写成 0 元——字段级校验本已拦住这种情况，投影这里不靠它兜底。
 * 商家编码只有价格模式可改，且留空 = 不改（后端按非空字段 set）。
 */
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

// 派生展示（不可填的商品级汇总 + 网格搜索）
/**
 * 一口价区间与总库存。
 *
 * 价格只统计**已设价**的行（未设价的行不参与，否则区间被 0 元拖平）；库存把 null（未填）按 0
 * 计入合计——与 `toSkuUpdateItems` 落库的 `?? 0` 同口径，两处不一致就会出现「页面说 9 件、库里 10 件」。
 */
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

/**
 * 搜索态下的可见行，带上它**在原数组里的下标**。
 *
 * 下标必须跟着行走：编辑与删除都是按下标改整份 rows，若按过滤后的顺序重排，
 * 一次输入就会落到别的 SKU 上。关键词为空时原样给全部；匹配规格名或商家编码（搜索框占位文案
 * 说的就是这两样），大小写不敏感。
 */
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
