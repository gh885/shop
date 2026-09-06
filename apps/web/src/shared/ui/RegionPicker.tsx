import { useState, useEffect, useRef } from "react"
import { ChevronDown } from "lucide-react"

import {
    Button,
    Popover,
    PopoverContent,
    PopoverTrigger,
    Skeleton,
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
    cn,
} from "@shop/ui-web"

/**
 * RegionPicker —— 级联选择器（输入框触发，下拉面板内省/市/区/街道 tab 切换）
 *
 * 概念：沿一棵树逐层向下选择，直到叶子节点。组件不认识"全国地址库"，
 * 只会"给一个节点，要它的孩子们"——数据从哪来、缓存多久，是外部的事。
 *
 * 契约：
 * - value        已选路径（受控），如 [山西省, 太原市, 小店区]；空数组 = 未选
 * - onChange     任意一层选中变化即回调完整路径（选中上层会截断下层）
 * - loadChildren 给一个节点返回其子节点列表；传 undefined 表示取根层
 * - levelLabels  各层页签名，如 ['省', '市', '区', '街道']
 * - placeholder  触发框未选时的占位文案
 *
 * 自有状态：面板开关、各层选项列表（含按父节点缓存）、当前浏览层、加载中 ——
 * 纯 UI 状态。"选中了什么"永远归 value，组件不私藏。
 */

export interface RegionNode {
    /** 层级内唯一标识（行政区划代码等） */
    code: string
    label: string
    /** 为 true 时选中即结束，不再加载下一层 */
    isLeaf?: boolean
}

export interface RegionPickerProps {
    value: RegionNode[]
    onChange: (path: RegionNode[]) => void
    loadChildren: (parent: RegionNode | undefined) => Promise<RegionNode[]>
    /** 各层页签名；未选中的页签显示此名，选中的页签也固定显示此名 */
    levelLabels?: string[]
    placeholder?: string
}

/** 缓存 key：根层统一用 ''，其余用父节点 code */
const cacheKeyOf = (parent: RegionNode | undefined) => parent?.code ?? ""

export default function RegionPicker({
    value,
    onChange,
    loadChildren,
    levelLabels,
    placeholder = "请选择",
}: RegionPickerProps) {
    const [open, setOpen] = useState(false)
    // 面板宽度跟随触发框（打开时实测，BaseUI 没有等效 CSS 变量可用）
    const [panelWidth, setPanelWidth] = useState<number>()
    // React ref 未挂载时约定为 null（非 undefined），no-null 白名单：框架哨兵
    const triggerRef = useRef<HTMLButtonElement | null>(null)
    // levels[i] = 第 i 层的可选列表；levels.length 至多比 value.length 多 1
    const [levels, setLevels] = useState<RegionNode[][]>([])
    const [activeLevel, setActiveLevel] = useState(0)
    // loading 初始即 true：挂载 effect 立即发起加载，避免在 effect 内同步 setState（级联渲染）
    const [loading, setLoading] = useState(true)
    const cacheRef = useRef(new Map<string, RegionNode[]>())
    // 防竞态：连续快速点击时，只接受最后一次请求的结果
    const requestIdRef = useRef(0)

    async function fetchChildren(parent: RegionNode | undefined): Promise<RegionNode[]> {
        const cached = cacheRef.current.get(cacheKeyOf(parent))
        if (cached) return cached
        const children = await loadChildren(parent)
        cacheRef.current.set(cacheKeyOf(parent), children)
        return children
    }

    // 挂载时：加载根层；若 value 非空（编辑回填），沿路径逐层把各级列表补齐。
    // 用 promise 链而非 try/finally（React Compiler 暂不支持 finally 块），.finally 复位 loading。
    useEffect(() => {
        const requestId = ++requestIdRef.current
        const load = async () => {
            const loaded: RegionNode[][] = []
            let parent
            for (const node of value) {
                // oxlint-disable-next-line eslint/no-await-in-loop -- 级联选择:每一层的加载依赖上层节点,必须串行
                const children = await fetchChildren(parent)
                loaded.push(children)
                parent = node.isLeaf ? undefined : node
                if (node.isLeaf) break
            }
            // 路径最深节点不是叶子 → 再加载下一层，等着用户继续选
            if (parent !== undefined || value.length === 0) {
                loaded.push(await fetchChildren(parent))
            }
            if (requestId !== requestIdRef.current) return
            setLevels(loaded)
            setActiveLevel(Math.min(value.length, loaded.length - 1))
        }
        // 挂载加载失败静默；loading 无条件复位（挂载加载与 selectAt 不重叠，后者依赖挂载结果）
        void load()
            .catch(() => undefined)
            .finally(() => setLoading(false))
        // 仅在挂载时执行；value 的后续变化全部由 selectAt 驱动
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const selectAt = (level: number, node: RegionNode) => {
        const path = [...value.slice(0, level), node]
        onChange(path)

        if (node.isLeaf) {
            setLevels((prev) => prev.slice(0, level + 1))
            // 选到叶子 = 选择完成，收起面板
            setOpen(false)
            return
        }
        // 加载下一层；加载完成后把浏览位置推过去
        const requestId = ++requestIdRef.current
        setLoading(true)
        fetchChildren(node)
            // oxlint-disable-next-line promise/always-return -- 终态副作用,链尾无下一环,无需返回值
            .then((children) => {
                if (requestId !== requestIdRef.current) return
                setLevels((prev) => [...prev.slice(0, level + 1), children])
                setActiveLevel(level + 1)
            })
            .finally(() => {
                if (requestId === requestIdRef.current) setLoading(false)
            })
    }

    const labelOf = (index: number) => levelLabels?.[index] ?? "请选择"
    const summary = value.map((n) => n.label).join(" / ")
    // 层级页签：位置即语义（第 N 级），显式建模为带 id 的条目，避免直接以数组下标作 JSX key
    const levelTabs = Array.from(
        { length: Math.max(levelLabels?.length ?? 0, levels.length) },
        (_, level) => ({
            id: `level-${level}`,
            value: String(level),
            label: labelOf(level),
            disabled: level >= levels.length,
        }),
    )

    return (
        <Popover
            open={open}
            onOpenChange={(next) => {
                if (next && triggerRef.current) {
                    setPanelWidth(triggerRef.current.getBoundingClientRect().width)
                }
                setOpen(next)
            }}
        >
            <PopoverTrigger
                ref={triggerRef}
                className={cn(
                    "border-input bg-input/30 flex h-9 w-full items-center justify-between gap-2 rounded-md border px-3 text-sm outline-none transition-colors",
                    "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30",
                    open && "border-ring ring-3 ring-ring/30",
                )}
            >
                <span className={cn("truncate", !summary && "text-muted-foreground")}>
                    {summary || placeholder}
                </span>
                <ChevronDown
                    className={cn(
                        "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
                        open && "rotate-180",
                    )}
                />
            </PopoverTrigger>

            <PopoverContent
                align="start"
                className="gap-0 p-0"
                style={panelWidth ? { width: panelWidth } : undefined}
            >
                <Tabs
                    value={String(activeLevel)}
                    onValueChange={(next) => setActiveLevel(Number(next))}
                    className="w-full gap-0"
                >
                    {/* 页签栏：所有层级一次摆出（对齐淘宝）；未到达的层级禁用
                        line 变体 = 无底色、激活项带下划线 */}
                    <TabsList
                        variant="line"
                        className="border-border w-full rounded-none border-b p-0"
                    >
                        {levelTabs.map((tab) => (
                            <TabsTrigger
                                key={tab.id}
                                value={tab.value}
                                disabled={tab.disabled}
                                className="data-active:text-foreground data-active:after:bg-foreground flex-1 py-2.5 font-medium data-active:font-semibold"
                            >
                                {tab.label}
                            </TabsTrigger>
                        ))}
                    </TabsList>

                    {/* 所有页签共享一个面板：当前层的选项列表 */}
                    <TabsContent value={String(activeLevel)}>
                        <ul className="flex h-60 flex-col gap-0.5 overflow-y-auto p-2">
                            {loading && levels[activeLevel] === undefined
                                ? // 选项行形状占位（约可容纳 6 行）
                                  [0, 1, 2, 3, 4, 5].map((i) => (
                                      <Skeleton
                                          /* eslint-disable-next-line react/no-array-index-key */
                                          key={i}
                                          className="h-9 rounded-md"
                                      />
                                  ))
                                : (levels[activeLevel] ?? []).map((node) => {
                                      const selected = value[activeLevel]?.code === node.code
                                      return (
                                          <li key={node.code}>
                                              <Button
                                                  variant="ghost"
                                                  aria-pressed={selected}
                                                  onClick={() => selectAt(activeLevel, node)}
                                                  className={cn(
                                                      "w-full justify-start",
                                                      selected && "text-foreground font-medium",
                                                  )}
                                              >
                                                  {node.label}
                                              </Button>
                                          </li>
                                      )
                                  })}
                        </ul>
                    </TabsContent>
                </Tabs>
            </PopoverContent>
        </Popover>
    )
}
