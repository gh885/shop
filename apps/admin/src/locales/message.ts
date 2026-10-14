import { messageFactFactory } from "@shop/i18n"
import type { AppKitMessageKey, AppKitParamsByKey } from "@shop/app-kit/i18n"
import type { AdminMessageKey, AdminParamsByKey } from "./messages.gen"

/** 本端与共享 catalog 的消息事实；不读取语言、不提前翻译。 */
export const message = messageFactFactory<
    AdminMessageKey | AppKitMessageKey,
    AdminParamsByKey & AppKitParamsByKey
>()
