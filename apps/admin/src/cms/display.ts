import type { NavGroup } from "@shop/api/sdk"
import type { AppLocale } from "@shop/i18n"
import { formatTimeShort } from "@shop/app-kit/display"

import type { AdminTranslate } from "#/locales/messages.gen"

// 生效窗口：双空 = 立即上线、长期有效；t/locale 由调用方参数递入（非组件模块读不到 context，才能在 node 测）
export function bannerWindowText(
    startAt: string | null,
    endAt: string | null,
    locale: AppLocale,
    t: AdminTranslate,
): string {
    if (!startAt && !endAt) return t("cms.display.window.nowForever")
    const from = startAt ? formatTimeShort(startAt, locale) : t("cms.display.window.now")
    const to = endAt ? formatTimeShort(endAt, locale) : t("cms.display.window.forever")
    return t("cms.display.window.range", { from, to })
}

export function subsSummary(subs: readonly NavGroup[], t: AdminTranslate): string {
    const itemCount = subs.reduce((sum, group) => sum + (group.items?.length ?? 0), 0)
    return t("cms.display.subsSummary", { groups: subs.length, items: itemCount })
}
