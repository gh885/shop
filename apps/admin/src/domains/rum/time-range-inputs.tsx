import { Input } from "@shop/ui-web"
import { useT } from "#/locales/use-t"

// 值由调用点持有、不在这里落 state：旁边的「应用筛选」要同时带上指纹/路由/端，状态收进来父组件就取不到时间窗了
export function TimeRangeInputs({
    from,
    to,
    onFromChange,
    onToChange,
}: {
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
