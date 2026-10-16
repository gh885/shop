import { useT } from "#/locales/use-t"
import { APP_KEYS, KIND_KEYS } from "./constants"

/**
 * 端 / 种类码 → 本端文案，查不到**退回码本身**而不是留白。
 *
 * 后端加了新端或新 kind 而文案还没补时，显示 `weapp` 比显示空白更容易被认出来——
 * 那是「有一个我们没归类的东西」，而空白看起来只像「这行没数据」。
 */
function AppCell({ code }: { code: string }) {
    const t = useT()
    const key = APP_KEYS[code]
    return <>{key ? t(key) : code}</>
}

function KindCell({ code }: { code: string }) {
    const t = useT()
    const key = KIND_KEYS[code]
    return <>{key ? t(key) : code}</>
}

/**
 * 「上报端 + 事件类型」合成一格、分两行。
 *
 * 两个列表页共用这一份而不是各写一遍：它同时承载了两条口径（端**和**种类都要看得见、
 * 认不出的码要退回去），分开写就会有一页只显示其中一条，而那种缺失不会让任何测试变红。
 *
 * 两者放同一格是因为它们一起回答「这一条是什么」——拆成两列后，窄屏上种类那列会先被挤掉。
 */
export function AppKindCell({ app, kind }: { app: string; kind: string }) {
    return (
        <div className="flex flex-col">
            <span>
                <AppCell code={app} />
            </span>
            <span className="text-xs text-muted-foreground">
                <KindCell code={kind} />
            </span>
        </div>
    )
}
