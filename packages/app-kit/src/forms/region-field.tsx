import { useId } from "react"
import { useQuery } from "@tanstack/react-query"

import { Field, FieldError, FieldLabel, RegionPicker } from "@shop/ui-web"

import { regionCascaderTreeOptions } from "./region-query"

/**
 * 省/市/区级联字段：RegionPicker（ui-web，reui columns 模式）+ 国标区划整树（common）的接线。
 * web 收货地址与 seller 商家地址共用。
 *
 * 受控于 6 位 `code`，交出去的也只有 `code`——省市区名不是表单字段，提交时由 @shop/common 的
 * regionNamesByCode 按同一个码反查（见 business-rules/account ACC-81）。
 *
 * 取数走 TanStack Query：整棵区划树是随包懒加载的静态 JSON（regions.json），staleTime=Infinity
 * 全会话只取一次；失败就地退化成"请选择"、不把整张地址表单换成错误页（这里没有可接的边界）。
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
    // 取数走 TanStack Query：整棵区划树随包懒加载，全会话只取一次（见 region-query）。
    // 本组件是表单里的行内控件，头上没有边界可接，失败就退化成“请选择”而不是报错页。
    const { data: items } = useQuery({ ...regionCascaderTreeOptions, throwOnError: false })
    // label 与 trigger（role=combobox）关联：可访问名是「所在地区」这个字段名，不是随选择变的值
    const labelId = useId()

    return (
        <Field orientation={orientation}>
            <FieldLabel
                id={labelId}
                required={required}
            >
                {label}
            </FieldLabel>
            {items && (
                <RegionPicker
                    value={code}
                    onChange={onChange}
                    items={items}
                    labelId={labelId}
                    placeholder="请选择省/市/区"
                />
            )}
            <FieldError errors={errors} />
        </Field>
    )
}
