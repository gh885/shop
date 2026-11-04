// 值由 @shop/common/contract 的 locale-vocab.gen.ts（源自 contracts/i18n.config.yaml，经 i18n:gen 产出）持有；这里原样转出给 @shop/i18n，同时本地导入供 platformYear 用——转出与自用分开写，不用 import 后即 re-export 的写法。
import { PLATFORM_TIME_ZONE } from "@shop/common/contract"

export { PLATFORM_TIME_ZONE } from "@shop/common/contract"

/** 平台展示时区：一期单一口径 Asia/Shanghai，口径与值出处见 docs/conventions/i18n.md §4。必须显式钉死而非让 Intl/date-fns 取环境默认：否则同一 instant 在服务端容器(常UTC)/本地(+08)/海外浏览器各算各的，「这天是哪天」两个答案→hydration 与本机线上不一致。一期不做多时区。 */

/** instant → 平台时区的年份。getFullYear() 读环境时区，页脚版权年份那类「显示一个年份」用它、别直接写 new Date().getFullYear()——跨年几小时 SSR 与浏览器读出不同年份 */
export function platformYear(value: Date): number {
    // 取 year 分量而非 getFullYear()（后者读环境时区）；解析失败（理论不发生）退回环境读法、不抛
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: PLATFORM_TIME_ZONE,
        year: "numeric",
    }).formatToParts(value)
    const year = parts.find((part) => part.type === "year")?.value
    return year === undefined ? value.getFullYear() : Number(year)
}
