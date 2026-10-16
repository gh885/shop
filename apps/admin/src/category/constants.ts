import { AttrKind, CategoryAttrStatus, CategoryStatus } from "@shop/api/sdk"
import type { AttrValueSource } from "@shop/api/sdk"
import { statusOptionsFromKeys, type KeyedStatusOption } from "@shop/common/domain"

import type { AdminMessageKey } from "#/locales/messages.gen"

// 镜像后端 CategoryService.MAX_LEVEL（不进契约）：界面四处判层级都从这同一个数读，别各自写死 3
export const CATEGORY_MAX_LEVEL = 3

type CategoryStatusKey = Extract<AdminMessageKey, `category.status.${string}`>

export const CATEGORY_STATUS_LABEL: Record<CategoryStatus, CategoryStatusKey> = {
    ENABLED: "category.status.ENABLED",
    DISABLED: "category.status.DISABLED",
}

type AttrKindKey = Extract<AdminMessageKey, `category.kind.${string}`>
type AttrStatusKey = Extract<AdminMessageKey, `category.attrStatus.${string}`>
type AttrValueSourceKey = Extract<AdminMessageKey, `category.source.${string}`>
type AttrKindOptionKey = Extract<AdminMessageKey, `category.kindOption.${string}`>

export const ATTR_KIND_LABEL: Record<AttrKind, AttrKindKey> = {
    SPEC: "category.kind.SPEC",
    PARAM: "category.kind.PARAM",
}

export const ATTR_STATUS_LABEL: Record<CategoryAttrStatus, AttrStatusKey> = {
    ENABLED: "category.attrStatus.ENABLED",
    DISABLED: "category.attrStatus.DISABLED",
}

export const ATTR_VALUE_SOURCE_LABEL: Record<AttrValueSource, AttrValueSourceKey> = {
    PLATFORM: "category.source.PLATFORM",
    SELLER: "category.source.SELLER",
}

// 下拉措辞与只印类型名的徽章是两句话：各占一个 key，别拼模板串（换语言时括号位置会变）
export const ATTR_KIND_OPTIONS: ReadonlyArray<KeyedStatusOption<AttrKind, AttrKindOptionKey>> =
    statusOptionsFromKeys<AttrKind, AttrKindOptionKey>({
        SPEC: "category.kindOption.SPEC",
        PARAM: "category.kindOption.PARAM",
    })
