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

/**
 * RegionPicker —— 行政区划单选级联（reui Cascader 的 columns 模式 + 本项目区划数据）
 *
 * 概念与数据源：整棵国标区划树由 @shop/common 的 regions 提供（loadRegionCascaderTree），
 * 已按同一套规则归一（直筒子市合成 6 位叶子）。本组件只认 reui 的 CascaderNode 结构
 * （value/label/children），不认识"全国地址库"——数据从哪来是外部的事，两端靠结构类型对齐。
 *
 * 为什么是 columns（横排多列）而不是逐层下钻：3000+ 区县，下钻要一路点进去才看得全；
 * 横排多列让省/市同时在屏上，且每列自带搜索（searchScope="deep"），能直接搜到区县。
 *
 * 契约：
 * - value        已选的叶子 code（如 "440305" / "441900"）；空串 = 未选
 * - onChange     叶子选中时回调该 6 位 code
 * - items        整棵区划树（RegionCascaderNode[]，结构上就是 CascaderNode[]）
 * - placeholder  触发框未选时的占位文案
 *
 * 自有状态：只有搜索词（纯 UI 态）交给 CascaderInput 自己管。"选中了什么"永远归 value。
 */

/** 与 reui CascaderNode 的结构子集：只用到 value/label/children，其余字段留空。 */
export type RegionNode = CascaderNode

export interface RegionPickerProps {
    /** 已选叶子码（6 位）；空串 = 未选 */
    value: string
    onChange: (code: string) => void
    /** 整棵区划树（loadRegionCascaderTree 的返回值） */
    items: RegionNode[]
    placeholder?: string
    disabled?: boolean
    /** 字段 label 元素的 id：trigger 是 role=combobox，可访问名应为字段名（而非随选择变的值） */
    labelId?: string
}

/** 触发框上的回显：叶子节点的祖先链（"广东省 / 深圳市 / 南山区"），用 " / " 连接。 */
function RegionSummary({ placeholder }: { placeholder: string }) {
    const { first, firstPath, isEmpty } = useCascaderSelection()

    if (isEmpty || !first) {
        return <span className="truncate text-muted-foreground">{placeholder}</span>
    }
    // firstPath 根在前：[省, 市, 区]；取 label 拼路径。first 本身是叶子，路径最后一项即它。
    const summary = firstPath.map((node) => node.label).join(" / ")
    return <span className="truncate">{summary || first.label}</span>
}

export function RegionPicker({
    value,
    onChange,
    items,
    placeholder = "请选择",
    disabled,
    labelId,
}: RegionPickerProps) {
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
            // 开在首列（省）而不是已选那一列：换地址从省开始挑最直接，也与旧 tab 版默认一致；
            // 已选路径由面包屑与 trigger 回显，不靠开在深层来表达
            revealSelected={false}
            disabled={disabled}
        >
            <CascaderTrigger
                // trigger 是 role=combobox：可访问名取字段 label（稳定），选中值作为内容被读出
                aria-labelledby={labelId}
                render={
                    <Button
                        variant="outline"
                        disabled={disabled}
                        className="w-full justify-between font-normal"
                    />
                }
            >
                <RegionSummary placeholder={placeholder} />
            </CascaderTrigger>

            <CascaderContent className="w-auto min-w-0">
                <CascaderPanel>
                    <CascaderNav>
                        {/* 面包屑：当前列在整条路径的哪一格，点任一节跳回那一层。
                            columns 开在已选那一列，要改省份就点回根节——这是 tab 版「省」页签的等价物 */}
                        <CascaderBreadcrumb />
                        <CascaderInput placeholder="搜索省 / 市 / 区" />
                    </CascaderNav>
                    <CascaderEmpty />
                    {/* 列宽/行高与项目 token 一致；多列时各列独立滚动 */}
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
