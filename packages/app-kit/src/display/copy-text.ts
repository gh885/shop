import { appKitMessage } from "../i18n/message"
import { notify } from "../data/notify"

/** 复制原值；完成时按当前语言反馈，不把字段标签带过异步边界。 */
export async function copyWithNotify(value: string): Promise<void> {
    try {
        await navigator.clipboard.writeText(value)
        notify.success(appKitMessage("appKit.copy.plain"))
    } catch {
        notify.error(appKitMessage("appKit.copy.failed"))
    }
}
