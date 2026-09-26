import { AttrKind, CategoryAttrStatus, CategoryStatus } from "@shop/api/sdk"
import type { AttrValueSource } from "@shop/api/sdk"

/** 类目启用状态文案（同 categories 软删语义：禁用是查询侧裁剪，可无损恢复） */
export const CATEGORY_STATUS_LABEL: Record<CategoryStatus, string> = {
    ENABLED: "启用中",
    DISABLED: "已禁用",
}

/** 属性类型文案。kind 创建后不可改（销售属性改成参数会让存量 SKU 失去出处） */
export const ATTR_KIND_LABEL: Record<AttrKind, string> = {
    SPEC: "销售属性",
    PARAM: "参数",
}

/** 属性类型说明：出现在新增属性的下拉里，说清两者在发布页的角色差异 */
export const ATTR_KIND_OPTIONS: ReadonlyArray<{ value: AttrKind; label: string }> = [
    { value: AttrKind.SPEC, label: `${ATTR_KIND_LABEL.SPEC}（决定 SKU 组合）` },
    { value: AttrKind.PARAM, label: `${ATTR_KIND_LABEL.PARAM}（商品参数，不影响 SKU）` },
]

export const ATTR_STATUS_LABEL: Record<CategoryAttrStatus, string> = {
    ENABLED: "启用",
    DISABLED: "已禁用",
}

/** 值域来源文案：平台预置 vs 卖家自行扩充 */
export const ATTR_VALUE_SOURCE_LABEL: Record<AttrValueSource, string> = {
    PLATFORM: "平台预置",
    SELLER: "卖家扩充",
}
