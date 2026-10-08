import type { NavGroup } from "@shop/api/sdk"
import type { AppLocale } from "@shop/common/i18n"
import { formatTimeShort } from "@shop/app-kit/display"

import type { AdminTranslate } from "#/locales/messages.gen" /**
 * CMS 列表单元格里那句「给人看的话」：从行数据折出文案的规则都收在这里，常量表（`./constants`）
 * 只留词表与颜色档。规则与数据混在一个文件里，下一个加列的人就分不清哪一半可以拿到 node 环境测。
 */

/**
 * 生效窗口：双空 = 立即上线、长期有效。
 *
 * `locale` 由调用方给（§3.5 约束 2）：这条规则要在 node 里脱离渲染被单测钉住，
 * 所以它不读任何上下文。句子在本端 catalog——非组件模块碰不到 React context，
 * `t` 由列 hook 当数据递进来（§3.5「非组件上下文用参数递实例」那条）。
 */
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

/**
 * 分组与词条的规模（`{groups} 组 / {items} 项`）：subs 是整段 JSONB，列表只报规模不铺开。
 * `t` 同 `bannerWindowText`，规模数字作 ICU 参数出、不拼模板串。
 */
export function subsSummary(subs: readonly NavGroup[], t: AdminTranslate): string {
    const itemCount = subs.reduce((sum, group) => sum + (group.items?.length ?? 0), 0)
    return t("cms.display.subsSummary", { groups: subs.length, items: itemCount })
}
