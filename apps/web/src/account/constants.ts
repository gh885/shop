import type { WebMessageKey } from "#/locales/messages.gen"

/**
 * 注销账号弹窗的展示常量：冷静期长度、三档处置清单、清单的语气色。
 *
 * 搬出组件的理由是「三档口径要与后端一致」这条要求——清单会改，改在一个只有渲染
 * 才看得见的文件里，没人能在 node 里对着 ACC-76 的口径核一遍。
 * 句子进 catalog（§4.1），表里只留 `titleKey` / `itemsKey`，渲染点按当前语言换。
 */

/** 冷静期天数，与后端 AccountDeletionTimeouts.COOLING_OFF 同值（只用于文案；确切生效时刻由接口给） */
export const COOLING_OFF_DAYS = 15

/** 三档处置的轻重：会丢 → 匿名留下 → 依法必须留 */
export type DispositionTone = "lost" | "kept" | "legal"

type DispositionTitleKey = Extract<
    WebMessageKey,
    `web.account.deletion.disposition.${string}.title`
>
type DispositionItemsKey = Extract<
    WebMessageKey,
    `web.account.deletion.disposition.${string}.items`
>

/** 三档处置：标题就是「你能拿回什么」，所以按不可逆程度从重到轻排 */
export const DISPOSITIONS: {
    titleKey: DispositionTitleKey
    itemsKey: DispositionItemsKey
    tone: DispositionTone
}[] = [
    {
        titleKey: "web.account.deletion.disposition.lost.title",
        itemsKey: "web.account.deletion.disposition.lost.items",
        tone: "lost",
    },
    {
        titleKey: "web.account.deletion.disposition.kept.title",
        itemsKey: "web.account.deletion.disposition.kept.items",
        tone: "kept",
    },
    {
        titleKey: "web.account.deletion.disposition.legal.title",
        itemsKey: "web.account.deletion.disposition.legal.items",
        tone: "legal",
    },
]

/** 语气 → 颜色：与 ui-web 的语义色一一对应，不写具体色值 */
export const TONE_CLASS: Record<DispositionTone, string> = {
    lost: "text-destructive",
    kept: "text-foreground",
    legal: "text-muted-foreground",
}
