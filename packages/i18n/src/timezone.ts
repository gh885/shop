// 值由 config.gen.ts（源自 contracts/i18n.config.yaml，经 i18n:gen 产出）持有；这里原样转出给 @shop/i18n，同时本地导入供 platformYear 用——转出与自用分开写，不用 import 后即 re-export 的写法。
import { PLATFORM_TIME_ZONE } from "./config.gen"

export { PLATFORM_TIME_ZONE } from "./config.gen"

/**
 * 平台展示时区：一期单一口径 `Asia/Shanghai`，口径、SSR 与浏览器同区、值出处见 docs/conventions/i18n.md §4。
 *
 * 必须显式钉死而非让 `Intl`/`date-fns` 取环境默认：否则同一 instant 在服务端容器（常 UTC）、本地（+08）、海外浏览器各算各的，「这天是哪天」出现两个答案 → hydration 文本不一致、本机与线上不一致。一期不做多时区产品功能（按用户时区展示、`X-Timezone` 头），真要做时改 yaml 的 `platformTimeZone` 与取它的函数，不在各处补时区参数。
 */

/**
 * 判「同一个日历年」用（物流轨迹跨年补年份那类分支）。存在的理由：`getFullYear()` 读**环境**时区，与按平台时区的 `format*` 放同一段逻辑会自相矛盾（实测 `2025-12-31T17:30:00Z` 在 UTC 还是 2025、在 +08 已是 2026，同一条轨迹给出相反形态）。
 */
export function isSamePlatformYear(a: Date, b: Date): boolean {
    return platformYear(a) === platformYear(b)
}

/**
 * instant → 平台时区的年份（数字）。与 `isSamePlatformYear` 同理：`getFullYear()` 读环境时区，页脚版权年份那类「显示一个年份」的位置用它，别直接写 `new Date().getFullYear()`——跨年那几小时 SSR 容器与浏览器会读出不同年份。
 */
export function platformYear(value: Date): number {
    // 取 year 分量而非 `getFullYear()`（后者读环境时区）；解析失败（理论上不发生）退回环境读法，与旧实现一致、不抛
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: PLATFORM_TIME_ZONE,
        year: "numeric",
    }).formatToParts(value)
    const year = parts.find((part) => part.type === "year")?.value
    return year === undefined ? value.getFullYear() : Number(year)
}
