import { PLATFORM_TIME_ZONE } from "./config.gen"

export { PLATFORM_TIME_ZONE }

/**
 * 平台展示时区：一期单一口径 `Asia/Shanghai`。
 *
 * **为什么必须显式钉，而不是让 `Intl` / `date-fns` 取环境默认。** 日期展示有两种读法：
 * 「这一刻是几点」与「这天是哪天」。后者要有一个明确的平台口径，否则同一笔数据在两处会出两个答案：
 *
 * - **SSR 与 hydration**：web 的页面在 Node 侧渲染，客户端再渲染一次。服务端容器（生产）
 *   与用户浏览器（本地 +08、海外任意）各按自己的默认时区算，同一个 instant 在 UTC 下是
 *   `2026-03-01`、在 +08 下是 `2026-03-02`——跨零点的时刻两边给出不同的日期，hydration 文本不一致；
 * - **本机与线上不一致**：开发机是 +08、生产容器常是 UTC，同一个页面本地看到 03-02、线上看到 03-01。
 *
 * 实测（同一 instant `2026-03-01T17:30:00Z`）：
 * ```
 * UTC            2026年3月1日 17:30
 * Asia/Shanghai  2026年3月2日 01:30
 * ```
 *
 * 值的唯一出处是 `contracts/i18n.config.yaml` 的 `platformTimeZone`，经 `pnpm i18n:gen` 产出到
 * `config.gen.ts`，这里原样转出——`app-kit` 的 `format*` 从这里取，别处不再写时区字符串，
 * 后端 `SupportedLocales.PLATFORM_TIME_ZONE` 也读同一份 yaml，两侧不会各写各的。
 *
 * **一期不做**多时区产品功能（按用户所在时区展示、P4 的 `X-Timezone` 头与时区业务规则）。
 * 真要做时改的是 yaml 里的 `platformTimeZone` 与取它的那些函数，而不是各处补时区参数。
 */

/**
 * 判「同一个日历年」用（物流轨迹跨年补年份那类分支）。
 *
 * 存在的理由是 `getFullYear()` 读的是**环境**时区：把它和 `format*`（按平台时区）放在同一段逻辑里，
 * 就会出现「按 +08 跨年、却按 UTC 判是否同年」这种自相矛盾——实测 `2025-12-31T17:30:00Z` 在 UTC 下
 * 还是 2025 年、在 +08 下已是 2026 年，两边对同一条轨迹节点会得出相反的展示形态。
 */
export function isSamePlatformYear(a: Date, b: Date): boolean {
    return platformYear(a) === platformYear(b)
}

/**
 * instant → 平台时区的年份（数字）。
 *
 * 与 `isSamePlatformYear` 同一个理由：`getFullYear()` 读的是**环境**时区。页脚版权年份那类
 * 「显示一个年份」的位置用它，不要直接写 `new Date().getFullYear()`——SSR 容器（UTC）与
 * 浏览器（用户所在任意时区）在跨年那几小时会读出不同年份，同一段文本两侧就不一致了。
 */
export function platformYear(value: Date): number {
    // 取 year 分量而不是 `getFullYear()`：后者读环境时区，这正是要避免的那件事。
    // 解析失败（理论上不会发生）退回环境读法，行为与旧实现一致，不抛
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: PLATFORM_TIME_ZONE,
        year: "numeric",
    }).formatToParts(value)
    const year = parts.find((part) => part.type === "year")?.value
    return year === undefined ? value.getFullYear() : Number(year)
}
