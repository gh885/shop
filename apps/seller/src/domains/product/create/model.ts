import type { CategoryConfig } from "@shop/api/sdk"

/** 一个 SKU 的草稿。价格存元文本，提交时再转分。 */
export type SkuDraft = {
    specs: Record<string, string>
    price: string
    originalPrice: string
    weightG: string
    barcode: string
    merchantCode: string
    enabled: boolean
}

/** 规格维度：attributeId → 已选值。 */
export type Dimensions = Record<string, string[]>

/** 非规格属性：attributeId → 值列表（multi 时多个）。 */
export type AttributeValues = Record<string, string[]>

/** 规格图：localSpecKey(attributeId, value) → 图片 key。 */
export type SpecImages = Record<string, string>

export type CreateDraft = {
    title: string
    subtitle: string
    brandId: string
    modelNo: string
    sevenDayReturn: boolean
    images: string[]
    detailImages: string[]
    attributes: AttributeValues
    dimensions: Dimensions
    specImages: SpecImages
    skus: Record<string, SkuDraft>
    /** 被商家禁售的组合（localSpecKey）。禁用的行不提交，后端允许缺组合。 */
    disabledKeys: string[]
}

/** 单次最多生成多少 SKU 组合。超过就不生成矩阵，避免前端先把自己算爆。 */
export const MAX_SKU_COMBINATIONS = 200

export type MatrixRow = {
    /** 本地稳定 key；只用于前端索引，提交时不发。 */
    key: string
    specs: Record<string, string>
    label: string
}

export type FieldErrors = Record<string, string>

export function emptyDraft(): CreateDraft {
    return {
        title: "",
        subtitle: "",
        brandId: "",
        modelNo: "",
        sevenDayReturn: true,
        images: [],
        detailImages: [],
        attributes: {},
        dimensions: {},
        specImages: {},
        skus: {},
        disabledKeys: [],
    }
}

export function emptySku(): SkuDraft {
    return {
        specs: {},
        price: "",
        originalPrice: "",
        weightG: "",
        barcode: "",
        merchantCode: "",
        enabled: true,
    }
}

/** 规格属性：能当 SKU 维度、且启用中。 */
export function specAttributes(config: CategoryConfig) {
    return config.attributes
        .filter((attribute) => attribute.salesSpec && attribute.status === "active")
        .toSorted((left, right) => left.sort - right.sort)
}

/** 普通属性：填在商品级、不参与 SKU 矩阵。 */
export function plainAttributes(config: CategoryConfig) {
    return config.attributes
        .filter((attribute) => !attribute.salesSpec && attribute.status === "active")
        .toSorted((left, right) => left.sort - right.sort)
}

/** 新商品只认启用中的值。 */
export function activeValues(attribute: CategoryConfig["attributes"][number]): string[] {
    return attribute.values
        .filter((value) => value.status === "active")
        .toSorted((left, right) => left.sort - right.sort)
        .map((value) => value.value)
}

/**
 * 当前可见的属性集合。
 *
 * <p>规则是单层的：被依赖属性自己不会再带 `visibleWhen`。依赖属性没值、被停用、
 * 或本身不可见时，当前属性也不可见。`neq` 要求依赖属性有值且不等于——
 * 「没填」不等于「不等于某个值」，那样会把默认隐藏的属性全放出来。
 */
export function visibleAttributeIds(config: CategoryConfig, values: AttributeValues): Set<string> {
    const byId = new Map(config.attributes.map((attribute) => [attribute.id, attribute]))
    const visible = new Set<string>()
    const hidden = new Set<string>()

    for (const attribute of config.attributes) {
        if (attribute.status !== "active") continue
        // 契约里这个字段没标可空，但后端 record 允许 null；运行时要按可空处理
        const rule = attribute.visibleWhen as typeof attribute.visibleWhen | null | undefined
        if (rule == null) {
            visible.add(attribute.id)
            continue
        }
        const dependency = byId.get(rule.attributeId)
        if (
            dependency === undefined ||
            dependency.status !== "active" ||
            hidden.has(dependency.id)
        ) {
            hidden.add(attribute.id)
            continue
        }
        const current = (values[dependency.id] ?? []).map((value) => value.trim()).filter(Boolean)
        if (current.length === 0) {
            hidden.add(attribute.id)
            continue
        }
        const expected = rule.values[0] ?? ""
        const ruleValues = new Set(rule.values)
        const matched =
            rule.operator === "eq"
                ? current.includes(expected)
                : rule.operator === "neq"
                  ? !current.includes(expected)
                  : rule.operator === "in"
                    ? current.some((value) => ruleValues.has(value))
                    : false
        if (matched) visible.add(attribute.id)
        else hidden.add(attribute.id)
    }
    return visible
}

/** 只算组合数，不生成数组——上限判断要在爆炸之前。 */
export function combinationCount(
    dimensions: Dimensions,
    attributes: CategoryConfig["attributes"],
): number {
    const counts = attributes
        .map(
            (attribute) =>
                new Set(
                    (dimensions[attribute.id] ?? []).map((value) => value.trim()).filter(Boolean),
                ).size,
        )
        .filter((count) => count > 0)
    if (counts.length === 0) return 1
    return counts.reduce((total, count) => total * count, 1)
}

/** 规格图槽位的本地 key。 */
export function specImageKey(attributeId: string, value: string): string {
    return `${attributeId}\u0000${value}`
}

/**
 * 本地 SKU 行 key：按 attributeId 排序后 JSON 序列化。
 *
 * <p>不用后端 `spec_key` 的 `id=value|...` 拼法——值里含分隔符时本地会撞 key。
 * 这个 key 不发给后端，后端自己算 `spec_key`。
 */
export function localSpecKey(specs: Record<string, string>): string {
    return JSON.stringify(
        Object.entries(specs).toSorted(([left], [right]) => left.localeCompare(right)),
    )
}

/** 规格值展示文案：按类目属性顺序拼 "红 / L"；空规格是单品。 */
export function specLabel(
    specs: Record<string, string>,
    attributes: CategoryConfig["attributes"],
    singleLabel: string,
): string {
    const parts = attributes
        .map((attribute) => specs[attribute.id])
        .filter((value) => value !== undefined && value !== "")
    return parts.length === 0 ? singleLabel : parts.join(" / ")
}

/**
 * 维度值 → SKU 行。做笛卡尔积，只展开已选值的维度；一个维度都没选就是单规格一行。
 *
 * <p>值去重并 trim：值文本直接进 `spec_key`，尾空格会造出两条看起来一样的 SKU。
 */
export function matrixRows(
    dimensions: Dimensions,
    attributes: CategoryConfig["attributes"],
    singleLabel: string,
): MatrixRow[] {
    if (combinationCount(dimensions, attributes) > MAX_SKU_COMBINATIONS) {
        return []
    }
    const selected = attributes
        .map((attribute) => ({
            id: attribute.id,
            values: [
                ...new Set(
                    (dimensions[attribute.id] ?? []).map((value) => value.trim()).filter(Boolean),
                ),
            ],
        }))
        .filter((dimension) => dimension.values.length > 0)

    if (selected.length === 0) {
        return [{ key: localSpecKey({}), specs: {}, label: singleLabel }]
    }

    let combinations: Record<string, string>[] = [{}]
    for (const dimension of selected) {
        const next: Record<string, string>[] = []
        for (const combination of combinations) {
            for (const value of dimension.values) {
                next.push({ ...combination, [dimension.id]: value })
            }
        }
        combinations = next
    }

    return combinations.map((specs) => ({
        key: localSpecKey(specs),
        specs,
        label: specLabel(specs, attributes, singleLabel),
    }))
}

/**
 * 把矩阵行与已填数据合并：仍在的行保留输入，新增的补空行，消失的丢弃。
 *
 * <p>这是「改规格不丢价格」的唯一实现点；调用方不要自己按顺序对。
 */
export function mergeSkuRows(
    rows: MatrixRow[],
    previous: Record<string, SkuDraft>,
): Record<string, SkuDraft> {
    return Object.fromEntries(
        rows.map((row) => {
            const existing = previous[row.key]
            return [
                row.key,
                existing === undefined
                    ? { ...emptySku(), specs: row.specs }
                    : { ...existing, specs: row.specs },
            ]
        }),
    )
}
