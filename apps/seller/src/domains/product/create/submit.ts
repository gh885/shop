import type { CategoryConfig, CreateProductRequest, ProductSpecImageRequest } from "@shop/api/sdk"
import type { Money } from "@shop/common/domain"

import { parsePriceCell } from "../form"
import {
    activeValues,
    combinationCount,
    emptySku,
    localSpecKey,
    matrixRows,
    MAX_SKU_COMBINATIONS,
    plainAttributes,
    specAttributes,
    visibleAttributeIds,
    type CreateDraft,
    type MatrixRow,
} from "./model"

/** 本地闸门能报的错误 key。全是无参消息，渲染层可以直接 `t(key)`。 */
export type CreateFieldErrorKey =
    | "product.create.error.titleRequired"
    | "product.create.error.imagesRequired"
    | "product.create.error.attrRequired"
    | "product.create.error.attrValueInvalid"
    | "product.create.error.specRequired"
    | "product.create.error.skuRequired"
    | "product.create.error.skuLimit"
    | "product.create.error.priceRequired"
    | "product.create.error.priceFormat"

const priceOf = (text: string): Money | undefined => parsePriceCell(text).value ?? undefined

const countOf = (text: string): number | undefined => {
    const trimmed = text.trim()
    if (trimmed === "") return undefined
    return /^\d+$/.test(trimmed) ? Number(trimmed) : undefined
}

/** 某条 SKU 的价格输入是否可用。空和非法都拦，提示分开。 */
function priceError(text: string): "required" | "format" | undefined {
    if (text.trim() === "") return "required"
    return parsePriceCell(text).value === null ? "format" : undefined
}

/** 实际会提交的行：矩阵行去掉商家禁售的组合。 */
export function activeRows(draft: CreateDraft, config: CategoryConfig): MatrixRow[] {
    return matrixRows(draft.dimensions, specAttributes(config), "").filter(
        (row) => !draft.disabledKeys.includes(row.key),
    )
}

/**
 * 前端闸门。只拦「不拦就会让用户白点一次提交」的项；值域、条码规则、违禁词都以后端为准。
 *
 * <p>隐藏属性不参与校验：条件不满足时它本来就不该提交，也不该挡提交。
 *
 * @returns field → i18n key，渲染层统一 `t()` 出句子
 */
export function validateDraft(
    draft: CreateDraft,
    config: CategoryConfig,
): Record<string, CreateFieldErrorKey> {
    const errors: Record<string, CreateFieldErrorKey> = {}
    if (draft.title.trim() === "") errors["title"] = "product.create.error.titleRequired"
    if (draft.images.length === 0) errors["images"] = "product.create.error.imagesRequired"

    const visible = visibleAttributeIds(config, draft.attributes)
    for (const attribute of plainAttributes(config)) {
        if (!visible.has(attribute.id)) continue
        const values = (draft.attributes[attribute.id] ?? []).filter((value) => value.trim() !== "")
        if (attribute.required && values.length === 0) {
            errors[`attr:${attribute.id}`] = "product.create.error.attrRequired"
        }
        if (attribute.valueType === "enum" && values.length > 0) {
            const allowed = new Set(activeValues(attribute))
            if (values.some((value) => !allowed.has(value)) && !attribute.allowCustom) {
                errors[`attr:${attribute.id}`] = "product.create.error.attrValueInvalid"
            }
        }
    }

    for (const attribute of specAttributes(config)) {
        const selected = (draft.dimensions[attribute.id] ?? []).filter(
            (value) => value.trim() !== "",
        )
        if (attribute.required && selected.length === 0) {
            errors[`spec:${attribute.id}`] = "product.create.error.specRequired"
        }
    }

    if (combinationCount(draft.dimensions, specAttributes(config)) > MAX_SKU_COMBINATIONS) {
        errors["skus"] = "product.create.error.skuLimit"
        return errors
    }

    const rows = activeRows(draft, config)
    if (rows.length === 0) {
        errors["skus"] = "product.create.error.skuRequired"
        return errors
    }

    for (const row of rows) {
        const sku = draft.skus[row.key] ?? emptySku()
        const price = priceError(sku.price)
        if (price === "required")
            errors[`sku:${row.key}:price`] = "product.create.error.priceRequired"
        if (price === "format") errors[`sku:${row.key}:price`] = "product.create.error.priceFormat"
        if (sku.originalPrice.trim() !== "" && priceOf(sku.originalPrice) === undefined) {
            errors[`sku:${row.key}:originalPrice`] = "product.create.error.priceFormat"
        }
    }
    return errors
}

/** 规格图只保留「对应维度值仍然存在」的那些。删值后旧图不该跟着提交。 */
function specImagesOf(draft: CreateDraft): ProductSpecImageRequest[] {
    const out: ProductSpecImageRequest[] = []
    for (const [key, imageUrl] of Object.entries(draft.specImages)) {
        if (imageUrl === "") continue
        const [attributeId, value] = key.split("\u0000")
        if (attributeId === undefined || value === undefined) continue
        const selected = draft.dimensions[attributeId] ?? []
        if (!selected.includes(value)) continue
        out.push({ attributeId, value, imageUrl })
    }
    return out
}

/** 草稿 → 创建请求。SKU 全量一次给，后端建草稿时就把规格与价格落库。 */
export function toCreateRequest(
    draft: CreateDraft,
    categoryId: string,
    config: CategoryConfig,
): CreateProductRequest {
    const visible = visibleAttributeIds(config, draft.attributes)
    const attributes = plainAttributes(config)
        .filter((attribute) => visible.has(attribute.id))
        .flatMap((attribute) =>
            (draft.attributes[attribute.id] ?? [])
                .map((value) => value.trim())
                .filter(Boolean)
                .map((value) => ({ attributeId: attribute.id, value })),
        )

    return {
        title: draft.title.trim(),
        subtitle: draft.subtitle.trim() === "" ? undefined : draft.subtitle.trim(),
        categoryId,
        brandId:
            config.brandPolicy === "forbidden" || draft.brandId === "" ? undefined : draft.brandId,
        modelNo: draft.modelNo.trim() === "" ? undefined : draft.modelNo.trim(),
        sevenDayReturn: draft.sevenDayReturn,
        images: draft.images,
        detailImages: draft.detailImages,
        attributes,
        specImages: specImagesOf(draft),
        skus: activeRows(draft, config).map((row) => {
            const sku = draft.skus[row.key] ?? emptySku()
            return {
                specs: row.specs,
                price: priceOf(sku.price) as Money,
                originalPrice: priceOf(sku.originalPrice),
                weightG: countOf(sku.weightG),
                barcode: sku.barcode.trim() === "" ? undefined : sku.barcode.trim(),
                merchantCode: sku.merchantCode.trim() === "" ? undefined : sku.merchantCode.trim(),
            }
        }),
    }
}

/** 提交后后端返回的 SKU 顺序由 spec 决定；这里只用于把本地矩阵对齐到已存在的行。 */
export function rowKeyOf(specs: Record<string, string>): string {
    return localSpecKey(specs)
}
