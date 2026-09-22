import { useEffect, useState } from "react"

import { findPath, loadChildren } from "@shop/common"
import { Field, FieldError, FieldLabel, RegionPicker, type RegionNode } from "@shop/ui-web"

/**
 * 省/市/区级联字段：RegionPicker（ui-web）+ 国标区划数据（common）的接线，web 收货地址与
 * seller 商家地址共用。受控于 6 位 `code`：外部把 code 灌进来（编辑回填、智能粘贴）时
 * 自动反查成路径；RegionPicker 只在挂载时按路径加载各级列表，所以路径与 code 未对齐期间
 * 先不渲染它，对齐后再挂载。用户手选则经 onChange 把完整路径交回调用方落表单字段。
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
    onChange: (path: RegionNode[]) => void
    errors?: ReadonlyArray<unknown>
    label?: string
    required?: boolean
    orientation?: "vertical" | "horizontal"
}) {
    const [path, setPath] = useState<RegionNode[]>([])
    const synced = (path.at(-1)?.code ?? "") === code

    useEffect(() => {
        if (synced) return
        // oxlint-disable-next-line promise/always-return -- 终态副作用,链尾无下一环,无需返回值
        void findPath(code).then(setPath)
    }, [code, synced])

    return (
        <Field orientation={orientation}>
            <FieldLabel required={required}>{label}</FieldLabel>
            {synced && (
                <RegionPicker
                    value={path}
                    onChange={(next) => {
                        setPath(next)
                        onChange(next)
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
