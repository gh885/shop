import { notify } from "../data/notify"

/**
 * 复制到剪贴板 + 全局反馈，三端唯一出口。
 *
 * 剪贴板 API 在权限被拒/非安全上下文下会 reject，忘了 catch 就是「点了没反应」——
 * 所以 try/catch 与话术一起收在这里，调用点只决定复制什么、怎么排版。
 * 失败话术统一成一句通用文案（原先一处「请手动选中复制」、一处「请手动选择运单号」，
 * 同一件事两种说法，用户无从知道是不是不同的故障）。
 */
export async function copyWithNotify(value: string, label = "内容"): Promise<void> {
    try {
        await navigator.clipboard.writeText(value)
        notify.success(`${label}已复制`)
    } catch {
        notify.error("复制失败，请手动选中复制")
    }
}
