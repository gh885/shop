import type { AdminAuditItem } from "@shop/api/sdk"
import { formatDateTime } from "@shop/app-kit/display"
import type { AppLocale } from "@shop/common/i18n"
import { ACTION_LABEL, TARGET_LABEL } from "./constants"

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

const HEADERS = ["时间", "动作", "操作人", "操作人ID", "对象类型", "对象ID", "说明"]

/** 导出文件的语言由点「导出」的那个人决定（§3.5 约束 2：非组件模块接 locale 参数） */
function toRow(item: AdminAuditItem, locale: AppLocale): string[] {
    return [
        formatDateTime(item.createdAt, locale),
        ACTION_LABEL[item.action] ?? item.action,
        item.operatorName || "未知操作人",
        item.operatorId,
        TARGET_LABEL[item.targetType] ?? item.targetType,
        item.targetId,
        item.detail || "",
    ]
}

/** BOM：没有它 Excel 会按本地代码页打开，中文全是乱码 */
export function buildAuditCsv(items: AdminAuditItem[], locale: AppLocale): string {
    const lines = [HEADERS, ...items.map((item) => toRow(item, locale))].map((cells) =>
        cells.map(csvCell).join(","),
    )
    return `﻿${lines.join("\r\n")}`
}

/** 触发浏览器下载。文件名带导出时刻，免得两次导出在下载目录里分不清 */
export function downloadAuditCsv(
    items: AdminAuditItem[],
    locale: AppLocale,
    now = new Date(),
): void {
    const stamp = now.toISOString().slice(0, 19).replaceAll(":", "").replace("T", "-")
    const blob = new Blob([buildAuditCsv(items, locale)], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `操作审计-${stamp}.csv`
    link.click()
    URL.revokeObjectURL(url)
}
