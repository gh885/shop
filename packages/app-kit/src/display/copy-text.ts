import { sharedMessage } from "@shop/i18n"
import { notify } from "../data/notify"

/** 复制原值；完成时按当前语言反馈，不把字段标签带过异步边界。 */
export async function copyWithNotify(value: string): Promise<void> {
    try {
        await navigator.clipboard.writeText(value)
        notify.success(sharedMessage("copy.plain"))
    } catch {
        notify.error(sharedMessage("copy.failed"))
    }
}
