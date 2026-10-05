import type { AdminAuditItem } from "@shop/api/sdk"
import { formatDateTime } from "@shop/app-kit/display"
import type { AppLocale } from "@shop/common/i18n"
import type { AdminTranslate } from "#/locales/messages.gen"
import { ACTION_KEYS, TARGET_KEYS } from "./constants"

/**
 * 审计导出：把当前筛选下的记录拼成 CSV 并触发下载。
 *
 * **为什么在前端拼**：审计真正要导的通常是「某人某段时间」那一小段（几百行），
 * 而一次拉全量再让后端出文件需要另开一个导出任务与生命周期管理（生成、下载、过期）——
 * 为了一次「导 CSV」引入那套机制不值当。真要导十万行时，页面会先拦住并提示收窄筛选。
 *
 * **敏感字段**：detail 在写入侧就只落掩码（后端 `PhoneNumber.mask()` 形状），这里原样带出，
 * 前端不解析、不还原——二次加工只会引入一个新的泄露面。
 */

/** RFC 4180 转义：含分隔符/引号/换行的字段用双引号包住，内部引号翻倍 */
function csvCell(value: string): string {
    return /[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value
}

/** CSV 表头：句子在 catalog，按点「导出」那个人选的语言取（`t` 由调用方当数据递进来） */
function headRow(t: AdminTranslate): string[] {
    return [
        t("admin.audit.field.time"),
        t("admin.audit.field.action"),
        t("admin.audit.field.operator"),
        t("admin.audit.csv.operatorId"),
        t("admin.audit.field.targetType"),
        t("admin.audit.csv.targetId"),
        t("admin.audit.field.detail"),
    ]
}

/** 导出文件的语言由点「导出」的那个人决定（§3.5 约束 2：非组件模块接 locale 参数）；
    文案走调用方传进来的 `t`（本端 catalog），非组件里没有 context，只能把 `t` 当数据递进来。 */
function toRow(item: AdminAuditItem, locale: AppLocale, t: AdminTranslate): string[] {
    const actionKey = ACTION_KEYS[item.action]
    const targetKey = TARGET_KEYS[item.targetType]
    return [
        formatDateTime(item.createdAt, locale),
        actionKey ? t(actionKey) : item.action,
        item.operatorName || t("admin.audit.operator.unknown"),
        item.operatorId,
        targetKey ? t(targetKey) : item.targetType,
        item.targetId,
        item.detail || "",
    ]
}

/** BOM：没有它 Excel 会按本地代码页打开，中文全是乱码 */
export function buildAuditCsv(
    items: AdminAuditItem[],
    locale: AppLocale,
    t: AdminTranslate,
): string {
    const lines = [headRow(t), ...items.map((item) => toRow(item, locale, t))].map((cells) =>
        cells.map(csvCell).join(","),
    )
    return `﻿${lines.join("\r\n")}`
}

/** 触发浏览器下载。文件名带导出时刻，免得两次导出在下载目录里分不清 */
export function downloadAuditCsv(
    items: AdminAuditItem[],
    locale: AppLocale,
    t: AdminTranslate,
    now = new Date(),
): void {
    const stamp = now.toISOString().slice(0, 19).replaceAll(":", "").replace("T", "-")
    const blob = new Blob([buildAuditCsv(items, locale, t)], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = t("admin.audit.export.fileName", { stamp })
    link.click()
    URL.revokeObjectURL(url)
}
