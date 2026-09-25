import { useEffect, useState } from "react"

import { findPath, loadChildren } from "@shop/common"
import { Field, FieldError, FieldLabel, RegionPicker, type RegionNode } from "@shop/ui-web"

/**
 * 省/市/区级联字段：RegionPicker（ui-web）+ 国标区划数据（common）的接线，web 收货地址与
 * seller 商家地址共用。受控于 6 位 `code`，交出去的也只有 `code`——省市区名不是表单字段，
 * 提交时由 @shop/common 的 regionNamesByCode 按同一个码反查（见 business-rules/account ACC-81）。
 * 外部把 code 灌进来（编辑回填、智能粘贴）时先反查成路径：RegionPicker 只在挂载时按路径加载
 * 各级列表，所以路径与 code 未对齐期间不渲染它，对齐后再挂载。
 */
export function RegionField({
    code,
    onChange,
    errors,
    label = "所在地区",
    required,
    orientation,
}: {
    code: string
    onChange: (code: string) => void
    errors?: ReadonlyArray<unknown>
    label?: string
    required?: boolean
    orientation?: "vertical" | "horizontal"
}) {
    const [path, setPath] = useState<RegionNode[]>([])
    const synced = (path.at(-1)?.code ?? "") === code

    useEffect(() => {
        if (synced) return
        let cancelled = false
        void (async () => {
            const next = await findPath(code)
            // oxlint-disable-next-line typescript/no-unnecessary-condition -- cleanup 会在异步查询期间改变取消标记
            if (!cancelled) setPath(next)
        })()
        return () => {
            cancelled = true
        }
    }, [code, synced])

    return (
        <Field orientation={orientation}>
            <FieldLabel required={required}>{label}</FieldLabel>
            {synced && (
                <RegionPicker
                    value={path}
                    onChange={(next) => {
                        setPath(next)
                        onChange(next.at(-1)?.code ?? "")
                    }}
                    loadChildren={loadChildren}
                    levelLabels={["省", "市", "区"]}
                    placeholder="请选择省/市/区"
                />
            )}
            <FieldError errors={errors} />
        </Field>
    )
}
