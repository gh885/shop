import { statusOptionsFromKeys, type KeyedStatusOption } from "@shop/common/domain"

import type { AdminMessageKey } from "#/locales/messages.gen"

// 镜像后端 CategoryService.MAX_LEVEL（不进契约）：界面四处判层级都从这同一个数读，别各自写死 3
export const CATEGORY_MAX_LEVEL = 3

/** 类目状态词表：后端 `UpdateCategoryStatusRequest.status` 是自由字符串，落 `ENABLED` / `DISABLED` */
export const CATEGORY_STATUSES = ["ENABLED", "DISABLED"] as const
export type CategoryStatus = (typeof CATEGORY_STATUSES)[number]

type CategoryStatusKey = Extract<AdminMessageKey, `category.status.${string}`>

export const CATEGORY_STATUS_LABEL: Record<CategoryStatus, CategoryStatusKey> = {
    ENABLED: "category.status.ENABLED",
    DISABLED: "category.status.DISABLED",
}

export const CATEGORY_STATUS_OPTIONS: ReadonlyArray<
    KeyedStatusOption<CategoryStatus, CategoryStatusKey>
> = statusOptionsFromKeys(CATEGORY_STATUS_LABEL)
