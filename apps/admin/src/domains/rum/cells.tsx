import { useT } from "#/locales/use-t"
import { APP_KEYS, KIND_KEYS } from "./constants"

// 查不到退回码本身而非留白：后端加了新端时显示原始码比空白更易发现
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

// 两个列表页共用这一份：各写一遍会有一页只渲染 app 或只渲染 kind，而缺哪条都不报错
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
