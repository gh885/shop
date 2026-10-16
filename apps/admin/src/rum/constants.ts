import { AdminRumEventQuerySchema, AdminRumIssueQuerySchema } from "@shop/api/schemas"
import { PermissionCodes } from "@shop/common/contract"
import { statusOptionsFromKeys, type KeyedStatusOption } from "@shop/common/domain"
import type { AdminMessageKey } from "#/locales/messages.gen"

/** 遥测排查入口的权限码：后端 `RUM_VIEW`（docs/conventions/permission-codes.md） */
export const RUM_VIEW_PERMISSION = PermissionCodes.RUM_VIEW

type AppKey = Extract<AdminMessageKey, `rum.app.${string}`>
type KindKey = Extract<AdminMessageKey, `rum.kind.${string}`>

/**
 * 端 / 种类码 → 文案 key（与后端 `RumVocabulary.APPS` / `KINDS` 两向对齐）。
 *
 * 查不到**退回码本身**而不是留白：后端加了新端或新 kind 而这里还没补文案时，
 * 表格上显示 `weapp` 比显示一格空白更容易被认出来——那是「有一个我们没归类的东西」。
 */
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

/**
 * 筛选入参的长度上限，与后端 `rum.dto.RumFieldRules` 同值（GEN-56 第五边）：
 * URL 里的筛选值先过 zod，超长直接不出请求、也不进 query key。
 *
 * 从生成物里读而不是自己写数字：后端改上限时这里跟着变，不用记得同步。
 */
export const RUM_APP_MAX = AdminRumIssueQuerySchema.properties.app.maxLength
export const RUM_KIND_MAX = AdminRumIssueQuerySchema.properties.kind.maxLength
export const RUM_FINGERPRINT_MAX = AdminRumEventQuerySchema.properties.fingerprint.maxLength
export const RUM_ROUTE_MAX = AdminRumEventQuerySchema.properties.route.maxLength

/** 问题列表一页 20 条：这是「扫一眼有哪些问题」，不是逐条读 */
export const RUM_ISSUE_PAGE_SIZE = 20

/**
 * 明细一页 50 条：这里是「翻证据」——同一个问题可能几百次上报，
 * 一页 20 条要翻十几页才能看出「是集中在某个版本还是散在所有版本」。
 */
export const RUM_EVENT_PAGE_SIZE = 50
