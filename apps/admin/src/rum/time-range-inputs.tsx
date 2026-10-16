import { Input } from "@shop/ui-web"
import { useT } from "#/locales/use-t"

/**
 * 时间窗的两个 `datetime-local` 输入。两个列表页共用这一份。
 *
 * 值由调用点持有、不在这里落 state：它旁边那个「应用筛选」按钮要同时带上指纹 / 路由 / 端，
 * 状态收进本组件之后父组件就取不到时间窗了。而这两个输入必须**同进同出**——
 * 一个页面用受控值、另一个用本地态，就会出现「改完时间忘了点应用、翻页时值不见了」。
 */
export function TimeRangeInputs({
    from,
    to,
    onFromChange,
    onToChange,
}: {
    /** `datetime-local` 的输入值（本地墙钟串），不是 ISO——转换在调用点提交时做 */
    from: string
    to: string
    onFromChange: (value: string) => void
    onToChange: (value: string) => void
}) {
    const t = useT()
    return (
        <>
            <Input
                aria-label={t("rum.filter.from")}
                type="datetime-local"
                value={from}
                onChange={(event) => onFromChange(event.target.value)}
                className="w-52"
            />
            <Input
                aria-label={t("rum.filter.to")}
                type="datetime-local"
                value={to}
                onChange={(event) => onToChange(event.target.value)}
                className="w-52"
            />
        </>
    )
}
