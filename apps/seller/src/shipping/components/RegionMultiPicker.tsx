import { useEffect, useMemo, useState, type CSSProperties } from "react"
import { ChevronRight, MapPin, Search, X } from "lucide-react"

import { loadRegionTree, type RegionTreeNode } from "@shop/common"
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
    Input,
    Skeleton,
    cn,
} from "@shop/ui-web"

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
    return (
        <div className="space-y-0.5">
            {nodes.map((node) => {
                const selectableChildren =
                    node.children?.filter((child) => child.code.length <= 6) ?? []
                const hasChildren = selectableChildren.length > 0
                const isExpanded = expanded.has(node.code)
                const checked = value.includes(node.code)

                return (
                    <div key={node.code}>
                        <div
                            className="flex items-center gap-1 rounded-md py-0.5 pr-1 pl-(--indent) hover:bg-muted"
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
                            <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 py-1 text-sm">
                                <Checkbox
                                    checked={checked}
                                    onCheckedChange={() => onToggleRegion(node.code)}
                                />
                                <span className="truncate">{node.name}</span>
                            </label>
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
    const [tree, setTree] = useState<RegionTreeNode[]>()
    const [open, setOpen] = useState(false)
    const [query, setQuery] = useState("")
    const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())

    useEffect(() => {
        let cancelled = false
        void (async () => {
            const next = await loadRegionTree()
            // oxlint-disable-next-line typescript/no-unnecessary-condition -- tsgolint 不追踪跨闭包的 cancelled 赋值窄化，此处守卫必要
            if (!cancelled) setTree(next)
        })()
        return () => {
            cancelled = true
        }
    }, [])

    const labelByCode = useMemo(() => {
        const labels = new Map<string, string>()
        if (tree) {
            for (const item of flattenRegions(tree)) {
                labels.set(item.code, item.path.join(" / "))
            }
        }
        return labels
    }, [tree])

    const searchResults = useMemo(() => {
        const keyword = query.trim()
        if (!tree || !keyword) return []
        return flattenRegions(tree)
            .filter((item) => item.name.includes(keyword))
            .slice(0, 200)
    }, [tree, query])

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
                                            <label
                                                key={item.code}
                                                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted"
                                            >
                                                <Checkbox
                                                    checked={value.includes(item.code)}
                                                    onCheckedChange={() => toggleRegion(item.code)}
                                                />
                                                <span className="min-w-0 truncate">
                                                    {item.path.join(" / ")}
                                                </span>
                                            </label>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="p-6 text-center text-sm text-muted-foreground">
                                        没有匹配的地区
                                    </p>
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
