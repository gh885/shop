import { messageFactFactory } from "@shop/common/i18n"
import type { AppKitMessageKey, AppKitParamsByKey } from "@shop/app-kit/i18n"
import type { WebMessageKey, WebParamsByKey } from "./messages.gen"

/** 本端与共享 catalog 的消息事实；不读取语言、不提前翻译。 */
export const message = messageFactFactory<
    WebMessageKey | AppKitMessageKey,
    WebParamsByKey & AppKitParamsByKey
>()
