import { assembleLocaleResources, type I18nResources } from "@shop/app-kit/i18n"
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
