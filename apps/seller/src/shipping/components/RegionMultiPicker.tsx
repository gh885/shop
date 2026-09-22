import { useDeferredValue, useMemo, useState, type CSSProperties } from "react"
import { useQuery } from "@tanstack/react-query"
import { ChevronRight, MapPin, Search, X } from "lucide-react"

import type { RegionTreeNode } from "@shop/common"
import {
    Badge,
    Button,
    Checkbox,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    Empty,
    EmptyTitle,
    Input,
    Label,
    Skeleton,
    cn,
} from "@shop/ui-web"

import { regionTreeOptions } from "#/shipping/queries"

interface FlatRegion {
    code: string
    name: string
    path: string[]
}

function flattenRegions(nodes: RegionTreeNode[], path: string[] = []): FlatRegion[] {
    const result: FlatRegion[] = []
    for (const node of nodes) {
        // 9 位街道码不参与运费模板地区选择
        if (node.code.length > 6) continue
        const nextPath = [...path, node.name]
        result.push({ code: node.code, name: node.name, path: nextPath })
        if (node.children) {
            result.push(...flattenRegions(node.children, nextPath))
        }
    }
    return result
}

function RegionTree({
    nodes,
    depth,
    expanded,
    value,
    onToggleExpanded,
    onToggleRegion,
}: {
    nodes: RegionTreeNode[]
    depth: number
    expanded: ReadonlySet<string>
    value: string[]
    onToggleExpanded: (code: string) => void
    onToggleRegion: (code: string) => void
}) {
    // 选中集转 Set：节点遍历里 includes 是 O(n×m)，树的每个节点都要判一次
    const valueSet = useMemo(() => new Set(value), [value])

    return (
        <div className="space-y-0.5">
            {nodes.map((node) => {
                const selectableChildren =
                    node.children?.filter((child) => child.code.length <= 6) ?? []
                const hasChildren = selectableChildren.length > 0
                const isExpanded = expanded.has(node.code)
                const checked = valueSet.has(node.code)

                return (
                    <div key={node.code}>
                        <div
                            className="flex items-center gap-1 rounded-md py-0.5 pr-1 pl-(--indent) hover:bg-muted"
                            // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- CSS 变量键不在 CSSProperties 内，断言是仓库既有写法
                            style={{ "--indent": `${depth * 16 + 4}px` } as CSSProperties}
                        >
                            {hasChildren ? (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-xs"
                                    aria-label={isExpanded ? "收起" : "展开"}
                                    onClick={() => onToggleExpanded(node.code)}
                                >
                                    <ChevronRight
                                        className={cn(
                                            "size-3.5 transition-transform",
                                            isExpanded && "rotate-90",
                                        )}
                                    />
                                </Button>
                            ) : (
                                <span className="size-5 shrink-0" />
                            )}
                            <Label
                                variant="row"
                                size="compact"
                                className="flex-1"
                            >
                                <Checkbox
                                    checked={checked}
                                    onCheckedChange={() => onToggleRegion(node.code)}
                                />
                                <span className="truncate">{node.name}</span>
                            </Label>
                        </div>
                        {hasChildren && isExpanded ? (
                            <RegionTree
                                nodes={selectableChildren}
                                depth={depth + 1}
                                expanded={expanded}
                                value={value}
                                onToggleExpanded={onToggleExpanded}
                                onToggleRegion={onToggleRegion}
                            />
                        ) : undefined}
                    </div>
                )
            })}
        </div>
    )
}

export function RegionMultiPicker({
    value,
    onChange,
    placeholder = "请选择地区",
}: {
    value: string[]
    onChange: (value: string[]) => void
    placeholder?: string
}) {
    // 调用点显式退出全局默认：本组件是表单里的行内控件，头上没有边界可接；
    // 数据虽是本仓库内动态 import 的静态 JSON（失败≈只在发版后旧 chunk 404），
    // 真炸了也不该把整张运费模板页换成错误页，退化成选项空着、重开即重取
    const { data: tree } = useQuery({ ...regionTreeOptions, throwOnError: false })
    const [open, setOpen] = useState(false)
    const [query, setQuery] = useState("")
    // 搜索输入不阻塞按键回显：过滤大树的工作让给非紧急渲染
    const deferredQuery = useDeferredValue(query)
    const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
    // 选中集转 Set：搜索结果遍历里 includes 是 O(n×m)
    const valueSet = useMemo(() => new Set(value), [value])

    // 一次拍平，标签回显与搜索共用（此前 labelByCode / searchResults 各 flatten 一遍全树）
    const flatRegions = useMemo(() => (tree ? flattenRegions(tree) : []), [tree])

    const labelByCode = useMemo(() => {
        const labels = new Map<string, string>()
        for (const item of flatRegions) {
            labels.set(item.code, item.path.join(" / "))
        }
        return labels
    }, [flatRegions])

    const searchResults = useMemo(() => {
        const keyword = deferredQuery.trim()
        if (!tree || !keyword) return []
        return flatRegions.filter((item) => item.name.includes(keyword)).slice(0, 200)
    }, [tree, deferredQuery, flatRegions])

    function toggleRegion(code: string) {
        onChange(value.includes(code) ? value.filter((item) => item !== code) : [...value, code])
    }

    function toggleExpanded(code: string) {
        setExpanded((prev) => {
            const next = new Set(prev)
            if (next.has(code)) next.delete(code)
            else next.add(code)
            return next
        })
    }

    return (
        <>
            <Button
                type="button"
                variant="outline"
                className="h-auto min-h-9 w-full justify-start text-left"
                onClick={() => setOpen(true)}
            >
                <MapPin className="size-4 shrink-0 text-muted-foreground" />
                <span
                    className={cn(
                        "min-w-0 flex-1 truncate",
                        value.length === 0 && "text-muted-foreground",
                    )}
                >
                    {value.length === 0 ? placeholder : `已选 ${value.length} 个地区`}
                </span>
            </Button>

            {value.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                    {value.map((code) => (
                        <Badge
                            key={code}
                            variant="secondary"
                        >
                            <span className="max-w-56 truncate">
                                {labelByCode.get(code) ?? code}
                            </span>
                            <button
                                type="button"
                                data-icon="inline-end"
                                aria-label="移除地区"
                                className="rounded-full p-0.5 hover:bg-foreground/10"
                                onClick={() => toggleRegion(code)}
                            >
                                <X className="size-3" />
                            </button>
                        </Badge>
                    ))}
                </div>
            ) : undefined}

            <Dialog
                open={open}
                onOpenChange={(next) => {
                    setOpen(next)
                    if (!next) setQuery("")
                }}
            >
                <DialogContent className="sm:max-w-xl">
                    <DialogHeader>
                        <DialogTitle>选择地区</DialogTitle>
                        <DialogDescription>
                            可分别选择省、市、区；更具体的地区规则会优先命中。
                        </DialogDescription>
                    </DialogHeader>

                    <div className="relative">
                        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            value={query}
                            placeholder="搜索省 / 市 / 区"
                            className="pl-8"
                            onChange={(event) => setQuery(event.target.value)}
                        />
                    </div>

                    <div className="h-80 overflow-y-auto rounded-lg border p-2">
                        {tree ? (
                            query.trim() ? (
                                searchResults.length > 0 ? (
                                    <div className="space-y-0.5">
                                        {searchResults.map((item) => (
                                            <Label
                                                key={item.code}
                                                variant="row"
                                            >
                                                <Checkbox
                                                    checked={valueSet.has(item.code)}
                                                    onCheckedChange={() => toggleRegion(item.code)}
                                                />
                                                <span className="min-w-0 truncate">
                                                    {item.path.join(" / ")}
                                                </span>
                                            </Label>
                                        ))}
                                    </div>
                                ) : (
                                    <Empty className="gap-0 py-6">
                                        <EmptyTitle>没有匹配的地区</EmptyTitle>
                                    </Empty>
                                )
                            ) : (
                                <RegionTree
                                    nodes={tree}
                                    depth={0}
                                    expanded={expanded}
                                    value={value}
                                    onToggleExpanded={toggleExpanded}
                                    onToggleRegion={toggleRegion}
                                />
                            )
                        ) : (
                            <div className="space-y-1.5 p-1">
                                {[0, 1, 2, 3, 4, 5].map((item) => (
                                    <Skeleton
                                        key={item}
                                        className="h-8 w-full rounded-md"
                                    />
                                ))}
                            </div>
                        )}
                    </div>

                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setOpen(false)}
                        >
                            完成
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}
