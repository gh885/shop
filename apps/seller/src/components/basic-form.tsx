import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
    Button,
    Input,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Textarea,
} from "@shop/ui-web"
import { CircleAlert, Plus, Trash2 } from "lucide-react"

import type { CategoryNode, ParamItem, Product } from "@shop/api"

import { productApi } from "#/shared/lib/api"

export interface BasicFormValues {
    categoryId: string
    name: string
    subtitle: string
    description: string
    mainImage: string
    /** 每行一个 URL，提交时拆分 */
    imagesText: string
    params: ParamItem[]
}

/** 商品基本信息表单：新建草稿与编辑共用（新建无 initial）。
    lockedCategoryId：发布流第一步已选定类目，表内不再重复选 */
export function BasicForm({
    initial,
    lockedCategoryId,
    submitting,
    submitText,
    onSubmit,
}: {
    initial?: Product
    lockedCategoryId?: string
    submitting: boolean
    submitText: string
    onSubmit: (values: BasicFormValues) => void
}) {
    const [values, setValues] = useState<BasicFormValues>(() => ({
        categoryId: lockedCategoryId ?? initial?.categoryId ?? "",
        name: initial?.name ?? "",
        subtitle: initial?.subtitle ?? "",
        description: initial?.description ?? "",
        mainImage: initial?.mainImage ?? "",
        imagesText: (initial?.images ?? []).join("\n"),
        params: initial?.params ?? [],
    }))
    const [error, setError] = useState<string | null>(null)

    const categories = useQuery({
        queryKey: ["categories", "tree"],
        queryFn: () => productApi.categoryTree(),
        staleTime: 10 * 60_000,
        enabled: !lockedCategoryId,
    })
    const leafOptions = flattenLeaves(categories.data ?? [])

    function patch(partial: Partial<BasicFormValues>) {
        setValues((v) => ({ ...v, ...partial }))
    }

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setError(null)
        if (!values.categoryId) {
            setError("请选择商品分类")
            return
        }
        if (!values.name.trim()) {
            setError("请输入商品名称")
            return
        }
        if (values.name.trim().length > 128) {
            setError("商品名最长 128 字")
            return
        }
        onSubmit({ ...values, name: values.name.trim(), subtitle: values.subtitle.trim() })
    }

    return (
        <form
            className="space-y-5"
            onSubmit={handleSubmit}
        >
            {!lockedCategoryId && (
                <div className="space-y-2">
                    <label
                        htmlFor="bf-category"
                        className="text-sm font-medium"
                    >
                        商品分类
                    </label>
                    <Select
                        value={values.categoryId}
                        onValueChange={(v) => patch({ categoryId: v as string })}
                    >
                        <SelectTrigger
                            id="bf-category"
                            className="w-full"
                        >
                            <SelectValue placeholder="选择末级分类" />
                        </SelectTrigger>
                        <SelectContent>
                            {leafOptions.map((opt) => (
                                <SelectItem
                                    key={opt.id}
                                    value={opt.id}
                                >
                                    {opt.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            )}

            <div className="space-y-2">
                <label
                    htmlFor="bf-name"
                    className="text-sm font-medium"
                >
                    商品名称
                </label>
                <Input
                    id="bf-name"
                    placeholder="越短越准，列表与搜索共用它"
                    maxLength={128}
                    value={values.name}
                    onChange={(e) => patch({ name: e.target.value })}
                />
            </div>

            <div className="space-y-2">
                <label
                    htmlFor="bf-subtitle"
                    className="text-sm font-medium"
                >
                    副标题
                </label>
                <Input
                    id="bf-subtitle"
                    placeholder="一句话卖点，可空"
                    maxLength={255}
                    value={values.subtitle}
                    onChange={(e) => patch({ subtitle: e.target.value })}
                />
            </div>

            <div className="space-y-2">
                <label
                    htmlFor="bf-description"
                    className="text-sm font-medium"
                >
                    详情描述
                </label>
                <Textarea
                    id="bf-description"
                    placeholder="商品详情，可空"
                    rows={5}
                    value={values.description}
                    onChange={(e) => patch({ description: e.target.value })}
                />
            </div>

            <div className="space-y-2">
                <label
                    htmlFor="bf-main-image"
                    className="text-sm font-medium"
                >
                    主图 URL
                </label>
                <Input
                    id="bf-main-image"
                    placeholder="列表缩略图与详情首图"
                    maxLength={255}
                    value={values.mainImage}
                    onChange={(e) => patch({ mainImage: e.target.value })}
                />
            </div>

            <div className="space-y-2">
                <label
                    htmlFor="bf-images"
                    className="text-sm font-medium"
                >
                    轮播图 URL（每行一个）
                </label>
                <Textarea
                    id="bf-images"
                    placeholder={"https://…/1.jpg\nhttps://…/2.jpg"}
                    rows={3}
                    value={values.imagesText}
                    onChange={(e) => patch({ imagesText: e.target.value })}
                />
            </div>

            <div className="space-y-2">
                <p className="text-sm font-medium">商品参数（非销售属性，如产地、材质）</p>
                <ParamsEditor
                    params={values.params}
                    onChange={(params) => patch({ params })}
                />
            </div>

            {error ? (
                <p className="flex items-center gap-1.5 text-sm text-destructive">
                    <CircleAlert className="size-4" />
                    {error}
                </p>
            ) : null}

            <Button
                type="submit"
                disabled={submitting}
                className="bg-primary text-primary-foreground hover:bg-primary-hover"
            >
                {submitting ? "保存中…" : submitText}
            </Button>
        </form>
    )
}

/** {name, value} 行编辑器：商品参数与规格维度复用 */
let rowSeq = 0
const nextRowId = () => `param-${++rowSeq}`

export function ParamsEditor({
    params,
    onChange,
}: {
    params: ParamItem[]
    onChange: (next: ParamItem[]) => void
}) {
    // 受控数组无 id：并行维护行 id，避免可增删列表用 index 当 key 导致 DOM 错位
    const [rowIds, setRowIds] = useState<string[]>(() => params.map(() => nextRowId()))

    function update(index: number, patch: Partial<ParamItem>) {
        onChange(params.map((p, i) => (i === index ? { ...p, ...patch } : p)))
    }

    return (
        <div className="space-y-2">
            {params.map((p, i) => (
                <div
                    key={rowIds[i]}
                    className="flex items-center gap-2"
                >
                    <Input
                        className="w-40"
                        placeholder="参数名"
                        maxLength={32}
                        value={p.name}
                        onChange={(e) => update(i, { name: e.target.value })}
                    />
                    <Input
                        className="flex-1"
                        placeholder="参数值"
                        maxLength={64}
                        value={p.value}
                        onChange={(e) => update(i, { value: e.target.value })}
                    />
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="删除参数"
                        onClick={() => {
                            onChange(params.filter((_, j) => j !== i))
                            setRowIds((ids) => ids.filter((_, j) => j !== i))
                        }}
                    >
                        <Trash2 className="size-4 text-muted-foreground" />
                    </Button>
                </div>
            ))}
            <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                    onChange([...params, { name: "", value: "" }])
                    setRowIds((ids) => [...ids, nextRowId()])
                }}
            >
                <Plus className="size-4" />
                添加参数
            </Button>
        </div>
    )
}

/** 类目树 → 末级选项（商品只挂末级分类），label 带层级路径 */
function flattenLeaves(
    nodes: CategoryNode[],
    prefix: string[] = [],
): { id: string; label: string }[] {
    return nodes.flatMap((node) => {
        const path = [...prefix, node.name]
        if (node.children && node.children.length > 0) {
            return flattenLeaves(node.children, path)
        }
        return [{ id: node.id, label: path.join(" / ") }]
    })
}
