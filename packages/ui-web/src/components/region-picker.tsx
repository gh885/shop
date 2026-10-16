import {
    Cascader,
    CascaderContent,
    CascaderEmpty,
    CascaderPanel,
    CascaderStatus,
    CascaderTrigger,
    useCascaderSelection,
} from "./reui/cascader/cascader"
import { CascaderColumns } from "./reui/cascader/cascader-columns"
import { CascaderInput, CascaderNav, CascaderBreadcrumb } from "./reui/cascader/cascader-nav"
import type { CascaderNode } from "./reui/cascader/cascader-types"

import { Button } from "./ui/button"
import { useUiLabels } from "./ui-labels"

/**
 * RegionPicker —— 行政区划单选级联（reui Cascader 的 columns 模式 + 本项目区划数据）。只认 reui 的 CascaderNode 结构，数据从哪来归外部，两端靠结构类型对齐。
 * 自有状态只有搜索词（纯 UI 态，交给 CascaderInput 管）；"选中了什么"永远归 value。
 */

/** 与 reui CascaderNode 的结构子集：只用到 value/label/children */
export type RegionNode = CascaderNode

export interface RegionPickerProps {
    /** 已选叶子码（6 位）；空串 = 未选 */
    value: string
    onChange: (code: string) => void
    /** loadRegionCascaderTree 的返回值 */
    items: RegionNode[]
    /** 不传取当前语言通用文案 */
    placeholder?: string
    /** 不传取当前语言通用文案 */
    searchPlaceholder?: string
    disabled?: boolean
    /** trigger 是 role=combobox：可访问名用字段 label（稳定），非随选择变的值 */
    labelId?: string
}

function RegionSummary({ placeholder }: { placeholder: string }) {
    const { first, firstPath, isEmpty } = useCascaderSelection()

    if (isEmpty || !first) {
        return <span className="truncate text-muted-foreground">{placeholder}</span>
    }
    // firstPath 根在前 [省,市,区]；叶子即最后一项
    const summary = firstPath.map((node) => node.label).join(" / ")
    return <span className="truncate">{summary || first.label}</span>
}

export function RegionPicker({
    value,
    onChange,
    items,
    placeholder,
    searchPlaceholder,
    disabled,
    labelId,
}: RegionPickerProps) {
    // 两处占位在渲染期从 context 取：SSR 首屏即有值，切语言随 provider 的 value 当场变
    const labels = useUiLabels().regionPicker
    const resolvedPlaceholder = placeholder ?? labels.placeholder
    const resolvedSearchPlaceholder = searchPlaceholder ?? labels.searchPlaceholder
    // columns 模式下 reui 单选的 value 就是叶子码字符串；未选用空串。
    const selected = value || ""

    return (
        <Cascader
            mode="columns"
            items={items}
            value={selected}
            onValueChange={(next) => {
                if (next) onChange(next)
            }}
            // 深搜：命中任意深度并能带出祖先链，3000+ 区县才搜得动
            searchScope="deep"
            // 只有叶子可选：省/市是中间层，不该被直接选为地址
            selectable={(node) => !node.children?.length}
            // 开在首列(省)：换地址从省挑最直接；已选路径靠面包屑与 trigger 回显表达
            revealSelected={false}
            disabled={disabled}
        >
            <CascaderTrigger
                aria-labelledby={labelId}
                render={
                    <Button
                        variant="outline"
                        disabled={disabled}
                        className="w-full justify-between font-normal"
                    />
                }
            >
                <RegionSummary placeholder={resolvedPlaceholder} />
            </CascaderTrigger>

            <CascaderContent className="w-auto min-w-0">
                <CascaderPanel>
                    <CascaderNav>
                        <CascaderBreadcrumb />
                        <CascaderInput placeholder={resolvedSearchPlaceholder} />
                    </CascaderNav>
                    <CascaderEmpty />
                    <CascaderColumns
                        columnWidth={200}
                        maxHeight={288}
                    />
                    <CascaderStatus />
                </CascaderPanel>
            </CascaderContent>
        </Cascader>
    )
}
