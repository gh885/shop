import { PermissionCodes } from "@shop/common/contract"

import type { AdminMessageKey } from "#/locales/messages.gen"

export const LOGISTICS_MANAGE_PERMISSION = PermissionCodes.LOGISTICS_MANAGE

/** 承运商词表：镜像后端 `fulfillment/api/Carriers` 的 CATALOG（键 = 归一化后的码） */
export const CARRIERS = [
    { code: "sf", labelKey: "logistics.carrier.sf" },
    { code: "ems", labelKey: "logistics.carrier.ems" },
    { code: "zto", labelKey: "logistics.carrier.zto" },
    { code: "yto", labelKey: "logistics.carrier.yto" },
    { code: "sto", labelKey: "logistics.carrier.sto" },
    { code: "yunda", labelKey: "logistics.carrier.yunda" },
    { code: "jt", labelKey: "logistics.carrier.jt" },
    { code: "jd", labelKey: "logistics.carrier.jd" },
    { code: "deppon", labelKey: "logistics.carrier.deppon" },
] as const satisfies ReadonlyArray<{ code: string; labelKey: AdminMessageKey }>

/** 八个标准码（镜像后端 `StandardTraceCode`）。补录与映射都不收 unknown——把码标成 unknown 等于没标 */
export const STANDARD_CODES = [
    { code: "COLLECTED", labelKey: "logistics.code.COLLECTED", variant: "info" },
    { code: "IN_TRANSIT", labelKey: "logistics.code.IN_TRANSIT", variant: "info" },
    { code: "OUT_FOR_DELIVERY", labelKey: "logistics.code.OUT_FOR_DELIVERY", variant: "info" },
    { code: "DELIVERED", labelKey: "logistics.code.DELIVERED", variant: "success" },
    { code: "REJECTED", labelKey: "logistics.code.REJECTED", variant: "warning" },
    { code: "RETURNED", labelKey: "logistics.code.RETURNED", variant: "warning" },
    { code: "EXCEPTION", labelKey: "logistics.code.EXCEPTION", variant: "destructive-subtle" },
    { code: "UNKNOWN", labelKey: "logistics.code.UNKNOWN", variant: "outline" },
] as const satisfies ReadonlyArray<{
    code: string
    labelKey: AdminMessageKey
    variant: "info" | "success" | "warning" | "destructive-subtle" | "outline"
}>

/** 可录入的标准码 = 全集去掉 UNKNOWN（unknown 只该由码表翻译失败产生） */
export const RECORDABLE_CODES = STANDARD_CODES.filter((entry) => entry.code !== "UNKNOWN")
