import { assembleLocaleResources, type I18nResources } from "@shop/app-kit/i18n"
import { DEFAULT_LOCALE, resolveMessage, type AppLocale } from "@shop/common/i18n"
import type { WebCatalog } from "./messages.gen"

/**
 * 买家端文案。资源按域拆成 `locales/<locale>/<namespace>.json`，清单由 glob 给，
 * 新增 namespace 文件不用回来改这里（为什么不用逐个 import：`packages/app-kit/src/i18n/resources.ts`）。
 *
 * `WebCatalog` 来自 `pnpm gen:i18n` 的生成物：这份文件是它被 tsc 与构建消费的落点。
 * 调用侧拼错 key 由同一份生成物里的 `WebTranslate` 拦（§5.5 契约 3），落点是 `./use-t.ts`。
 * 而「资源齐不齐」从来不由这里的类型保证，那是 codegen 在写出生成物之前判完的事（§5.5）。
 */
const localeFiles = import.meta.glob<WebCatalog>("./*/*.json", {
    eager: true,
    import: "default",
})

export const webMessages: I18nResources = assembleLocaleResources(localeFiles)

/**
 * 非组件调用点的纯翻译（§9 P3′-a）。
 *
 * `useT` 是 hook，只能在 React 树里用；而 route 的 `head()` 与 `productSeo` 恰恰跑在树外——
 * 首屏 `<title>`/og/meta 是 SSR 相对 SPA 的硬收益，最该按语言出，却拿不到 hook。这里补那条口子：
 * locale 由 router context 一路传进来（服务端按请求解析、客户端从 `<html lang>` 继承），缺失落平台默认。
 *
 * 取不到 key 回落 key 本身，与 `useT` 同策：head 是渲染路径，缺一条文案不该把整页抛挂。
 * 放这里（而非单独 translate.ts）：webMessages 是本域的 barrel 装配物，反向 import 它会踩 fallow 的
 * 「shared → domain-api」边界；同处 index.ts 就不存在那条跨域边。
 */
export function translateWeb(key: string, locale?: AppLocale): string {
    return resolveMessage(webMessages, key, locale ?? DEFAULT_LOCALE) ?? key
}
