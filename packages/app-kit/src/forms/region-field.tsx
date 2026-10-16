import { useId } from "react"
import { useQuery } from "@tanstack/react-query"

import { Field, FieldError, FieldLabel, RegionPicker } from "@shop/ui-web"

import { useT } from "../i18n"

import { regionCascaderTreeOptions } from "./region-query"

/**
 * 区划字段唯一进出都是 6 位 `code`；名字不是字段，提交时按同一码反查（见 business-rules/account ACC-81）
 */
export function RegionField({
    code,
    onChange,
    errors,
    label,
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
    const t = useT()
    // 行内控件头上没有边界可接，失败就退化成「请选择」（取数定义见 region-query）
    const { data: items } = useQuery({ ...regionCascaderTreeOptions, throwOnError: false })
    // label 与 trigger（role=combobox）关联：可访问名是「所在地区」这个字段名，不是随选择变的值
    const labelId = useId()

    return (
        <Field orientation={orientation}>
            <FieldLabel
                id={labelId}
                required={required}
            >
                {label ?? t("form.regionLabel")}
            </FieldLabel>
            {items && (
                <RegionPicker
                    value={code}
                    onChange={onChange}
                    items={items}
                    labelId={labelId}
                />
            )}
            <FieldError errors={errors} />
        </Field>
    )
}
