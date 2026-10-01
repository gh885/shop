import {
    formatMessage,
    isMessageValid,
    resolveMessage,
    type AppLocale,
    type I18nResources,
} from "@shop/common/i18n" /**
 * ⚠️ 新增命名空间（`locales/<locale>/<ns>.json`）之后跑测试若报「新 key 全是 key 本身」：
 * `--fs-module-cache`（全部 test script 都带着）按**本文件内容哈希**复用编译产物，而 glob 的展开结果
 * 被烤进了那份产物——本文件一个字没变，缓存就还停在新增之前。改本文件任意一行即可失效；
 * 流程细则写在 docs/conventions/i18n.md「新增命名空间」那条。
 */
import { assembleLocaleResources } from "./resources"
import type { AppKitCatalog, AppKitMessageKey, AppKitParamsOf } from "../locales/messages.gen"

const localeFiles = import.meta.glob<AppKitCatalog>("../locales/*/*.json", {
    eager: true,
    import: "default",
})

/**
 * 语言自报名（下拉里每个 Locale 显示什么）。
 *
 * 用该语言自己的写法是通行做法：中文使用者在语言选择器里找的是「中文」而不是 "Chinese"，
 * 切到英文之后才看得见 English。它按 Locale 索引、不走消息回退链（不是一条 key），
 * 所以与 APP_KIT_MESSAGES 同层不同用途——都住在这个 i18n 展示数据文件里，别再给语言标签另起一处。
 */
export const LOCALE_LABELS: Record<AppLocale, string> = {
    "zh-CN": "中文",
    "en-US": "English",
}

/**
 * 共享文案资源。以前这 31 条内联在 TS 里，是全仓库唯一被 glob 清单看不见的文案（§4.2）——
 * 偏偏全仓库只有两条带插值的消息（`appKit.topbar.searchLabel` 的 `{brand}`、
 * `appKit.login.resend` 的 `{countdown}`）住在那里面，旧校验器只扫三端的 `src/locales/`，
 * 一条都查不到。落成 `locales/<locale>/<namespace>.json` 后它与三端资源走同一份清单、同一个 codegen。
 *
 * 这里同样用 glob 而不是逐个 import：本包将来按域拆文件时，「新文件忘了加进清单」是静默失效，
 * 而这正是当初把内联字典挪出来的理由，不该在搬迁的落点上把它重新种回去。
 *
 * `import.meta.glob` 的类型参数是生成物那份 `AppKitCatalog`。要说清它保证不了什么：
 * JSON 的形状是装配时才知道的，tsc 不会因为某条 key 少了一句而红——真正判过这件事的是
 * 写出 `messages.gen.ts` 之前的 codegen（§5.5 的表）。类型在这里的作用是让调用侧拼错 key 变编译错误。
 */
export const APP_KIT_MESSAGES: I18nResources = assembleLocaleResources(localeFiles)

/**
 * app-kit 文案的取词入口。
 *
 * `locale` 必填且排在第二（§3.5 约束 2 的「能传就传」）：与同层的 `getErrorMessage(code, locale, fallback)`
 * 一个形状——可选参数只能排在 locale 之后，否则调用点每处都得写 `undefined`。
 * 它读的是**调用方给的语言**，不再读进程级可变量：那个 `let` 已删，理由见 §3.5。
 */
export function translateAppKit<K extends AppKitMessageKey>(
    key: K,
    locale: AppLocale,
    params?: AppKitParamsOf<K>,
): string {
    const template = resolveMessage(APP_KIT_MESSAGES, key, locale)
    if (template === undefined || !isMessageValid(template, locale)) return key
    return formatMessage(template, params, locale)
}
