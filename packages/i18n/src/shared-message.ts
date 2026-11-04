import { messageFactFactory } from "./message-fact"
import type { SharedMessageKey, SharedParamsByKey } from "./locales/messages.gen"

export const sharedMessage = messageFactFactory<SharedMessageKey, SharedParamsByKey>()
