import type { WebMessageKey } from "#/locales/messages.gen"

export const COOLING_OFF_DAYS = 15

export type DispositionTone = "lost" | "kept" | "legal"

type DispositionTitleKey = Extract<WebMessageKey, `account.deletion.disposition.${string}.title`>
type DispositionItemsKey = Extract<WebMessageKey, `account.deletion.disposition.${string}.items`>

export const DISPOSITIONS: {
    titleKey: DispositionTitleKey
    itemsKey: DispositionItemsKey
    tone: DispositionTone
}[] = [
    {
        titleKey: "account.deletion.disposition.lost.title",
        itemsKey: "account.deletion.disposition.lost.items",
        tone: "lost",
    },
    {
        titleKey: "account.deletion.disposition.kept.title",
        itemsKey: "account.deletion.disposition.kept.items",
        tone: "kept",
    },
    {
        titleKey: "account.deletion.disposition.legal.title",
        itemsKey: "account.deletion.disposition.legal.items",
        tone: "legal",
    },
]

export const TONE_CLASS: Record<DispositionTone, string> = {
    lost: "text-destructive",
    kept: "text-foreground",
    legal: "text-muted-foreground",
}
