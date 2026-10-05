import { messageFactFactory } from "@shop/common/i18n"
import type { AppKitMessageKey, AppKitParamsByKey } from "../locales/messages.gen"

export const appKitMessage = messageFactFactory<AppKitMessageKey, AppKitParamsByKey>()
