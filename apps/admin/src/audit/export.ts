import type { AdminAuditItem } from "@shop/api/sdk"
import { formatDateTime } from "@shop/app-kit/display"
import type { AppLocale } from "@shop/i18n"
import type { AdminTranslate } from "#/locales/messages.gen"
import { ACTION_KEYS, TARGET_KEYS } from "./constants"

// RFC 4180 转义：含分隔符/引号/换行的字段用双引号包住，内部引号翻倍
function csvCell(value: string): string {
    return /[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value
}

function headRow(t: AdminTranslate): string[] {
    return [
        t("audit.field.time"),
        t("audit.field.action"),
        t("audit.field.operator"),
        t("audit.csv.operatorId"),
        t("audit.field.targetType"),
        t("audit.csv.targetId"),
        t("audit.field.detail"),
    ]
}

function toRow(item: AdminAuditItem, locale: AppLocale, t: AdminTranslate): string[] {
    const actionKey = ACTION_KEYS[item.action]
    const targetKey = TARGET_KEYS[item.targetType]
    return [
        formatDateTime(item.createdAt, locale),
        actionKey ? t(actionKey) : item.action,
        item.operatorName || t("audit.operator.unknown"),
        item.operatorId,
        targetKey ? t(targetKey) : item.targetType,
        item.targetId,
        item.detail || "",
    ]
}

// 前置 BOM：没有它 Excel 会按本地代码页打开，中文全是乱码
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
    link.download = t("audit.export.fileName", { stamp })
    link.click()
    URL.revokeObjectURL(url)
}
