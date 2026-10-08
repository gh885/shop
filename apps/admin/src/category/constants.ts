import { AttrKind, CategoryAttrStatus, CategoryStatus } from "@shop/api/sdk"
import type { AttrValueSource } from "@shop/api/sdk"
import { statusOptionsFromKeys, type KeyedStatusOption } from "@shop/common/domain"

import type { AdminMessageKey } from "#/locales/messages.gen"

/**
 * 类目最多三级（叶子 = 三级 = 唯一能挂商品与属性模板的那一层）。
 *
 * 镜像后端 `product/service/CategoryService.MAX_LEVEL`：那一格**不进契约**（level 由后端从
 * parentId 推导，不是入参），所以前端这一份没有契约镜像可走，由 `FieldRuleVocabularyTest`
 * 的 JAVA_TWINS 直接比 Java 源码里那个数。界面上「还能不能再挂子类目」「是否显示属性模板」
 * 都从这同一个数判——写死 3 的那几处一旦漏改一处，就会出现「三级还能点新建子类目」这种谎。
 */
export const CATEGORY_MAX_LEVEL = 3

type CategoryStatusKey = Extract<AdminMessageKey, `category.status.${string}`>

/** 类目启用状态文案 key（同 categories 软删语义：禁用是查询侧裁剪，可无损恢复）。句子在 catalog。 */
export const CATEGORY_STATUS_LABEL: Record<CategoryStatus, CategoryStatusKey> = {
    ENABLED: "category.status.ENABLED",
    DISABLED: "category.status.DISABLED",
}

// 属性模板的三张文案表本地化后仍是 `Record<码值, key>`：穷尽性由表的类型锁死，句子在渲染边界
// 由本端 `t` 换出来（§4.1 —— common 不带用户可见文案，这一格归 admin catalog）。
type AttrKindKey = Extract<AdminMessageKey, `category.kind.${string}`>
type AttrStatusKey = Extract<AdminMessageKey, `category.attrStatus.${string}`>
type AttrValueSourceKey = Extract<AdminMessageKey, `category.source.${string}`>
type AttrKindOptionKey = Extract<AdminMessageKey, `category.kindOption.${string}`>

/** 属性类型文案。kind 创建后不可改（销售属性改成参数会让存量 SKU 失去出处） */
export const ATTR_KIND_LABEL: Record<AttrKind, AttrKindKey> = {
    SPEC: "category.kind.SPEC",
    PARAM: "category.kind.PARAM",
}

export const ATTR_STATUS_LABEL: Record<CategoryAttrStatus, AttrStatusKey> = {
    ENABLED: "category.attrStatus.ENABLED",
    DISABLED: "category.attrStatus.DISABLED",
}

/** 值域来源文案：平台预置 vs 卖家自行扩充 */
export const ATTR_VALUE_SOURCE_LABEL: Record<AttrValueSource, AttrValueSourceKey> = {
    PLATFORM: "category.source.PLATFORM",
    SELLER: "category.source.SELLER",
}

/**
 * 属性类型下拉：完整句子（含括号说明）各占一个 key——它是「新增属性」那一格的措辞，
 * 与只印类型名的徽章 `ATTR_KIND_LABEL` 不是一句话，不拼模板字符串（换语言时括号位置会变）。
 */
export const ATTR_KIND_OPTIONS: ReadonlyArray<KeyedStatusOption<AttrKind, AttrKindOptionKey>> =
    statusOptionsFromKeys<AttrKind, AttrKindOptionKey>({
        SPEC: "category.kindOption.SPEC",
        PARAM: "category.kindOption.PARAM",
    })
