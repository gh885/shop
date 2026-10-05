import { assembleLocaleResources, type I18nResources } from "@shop/app-kit/i18n"
import type { SellerCatalog } from "./messages.gen"

/**
 * 卖家端文案。资源按域拆成 `locales/<locale>/<namespace>.json`，清单由 glob 给，
 * 新增 namespace 文件不用回来改这里；`SellerCatalog` 来自 `pnpm i18n:gen`。
 * 「资源齐不齐」由 codegen 在写出生成物之前判完，不由这里的类型保证（§5.5）。
 */
const localeFiles = import.meta.glob<SellerCatalog>("./*/*.json", {
    eager: true,
    import: "default",
})

export const sellerMessages: I18nResources = assembleLocaleResources(localeFiles)
