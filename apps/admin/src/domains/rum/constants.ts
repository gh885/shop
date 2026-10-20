import { AdminRumEventQuerySchema, AdminRumIssueQuerySchema } from "@shop/api/schemas"
import { PermissionCodes } from "@shop/common/contract"
import { statusOptionsFromKeys, type KeyedStatusOption } from "@shop/common/domain"
import type { AdminMessageKey } from "#/locales/messages.gen"

/** 槽位：本域纯数据表（权限码、端/类型→label key、statusOptionsFromKeys 派生的筛选选项、契约 maxLength、分页上限）。时间展示走 TimeText 组件（columns/event-columns），本域无出文案的函数，故无 display.ts */

export const RUM_VIEW_PERMISSION = PermissionCodes.RUM_VIEW

type AppKey = Extract<AdminMessageKey, `rum.app.${string}`>
type KindKey = Extract<AdminMessageKey, `rum.kind.${string}`>

export const APP_KEYS: Record<string, AppKey> = {
    web: "rum.app.web",
    seller: "rum.app.seller",
    admin: "rum.app.admin",
}

export const KIND_KEYS: Record<string, KindKey> = {
    error: "rum.kind.error",
    performance: "rum.kind.performance",
    api: "rum.kind.api",
    route: "rum.kind.route",
    fallback: "rum.kind.fallback",
}

export const APP_OPTIONS: ReadonlyArray<KeyedStatusOption<string, AppKey>> =
    statusOptionsFromKeys(APP_KEYS)
export const KIND_OPTIONS: ReadonlyArray<KeyedStatusOption<string, KindKey>> =
    statusOptionsFromKeys(KIND_KEYS)

// 从生成物读 maxLength 而不是写死数字：后端改上限时这里跟着变，写死会悄悄漂移
export const RUM_APP_MAX = AdminRumIssueQuerySchema.properties.app.maxLength
export const RUM_KIND_MAX = AdminRumIssueQuerySchema.properties.kind.maxLength
export const RUM_FINGERPRINT_MAX = AdminRumEventQuerySchema.properties.fingerprint.maxLength
export const RUM_ROUTE_MAX = AdminRumEventQuerySchema.properties.route.maxLength

export const RUM_ISSUE_PAGE_SIZE = 20

export const RUM_EVENT_PAGE_SIZE = 50
