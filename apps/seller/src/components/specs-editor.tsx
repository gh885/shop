import { useState } from "react"
import { Button, Input } from "@shop/ui-web"
import { CircleAlert, Plus, Trash2 } from "lucide-react"

import type { SpecItem } from "@shop/api"

interface SpecDraft {
    id: string
    name: string
    /** 逗号/顿号分隔的取值文本，保存时拆分去重 */
    valuesText: string
}

let draftSeq = 0
const nextDraftId = () => `spec-${++draftSeq}`

function toDrafts(specs: SpecItem[] | null | undefined): SpecDraft[] {
    return (specs ?? []).map((s) => ({
        id: nextDraftId(),
        name: s.name,
        valuesText: s.values.join("，"),
    }))
}

/**
 * 销售规格编辑器：维度（颜色/尺码…）+ 取值列表。
 * 保存会按新模板对账 SKU：组合没变的保留，新增的补 SKU，消失的停用。
 */
export function SpecsEditor({
    specs,
    submitting,
    onSave,
}: {
    specs: SpecItem[] | null | undefined
    submitting: boolean
    onSave: (specs: SpecItem[]) => void
}) {
    const [drafts, setDrafts] = useState<SpecDraft[]>(() => toDrafts(specs))
    const [error, setError] = useState<string | null>(null)

    function update(index: number, patch: Partial<SpecDraft>) {
        setDrafts((ds) => ds.map((d, i) => (i === index ? { ...d, ...patch } : d)))
    }

    function handleSave() {
        setError(null)
        const specs: SpecItem[] = []
        for (const d of drafts) {
            const name = d.name.trim()
            const values = [
                ...new Set(
                    d.valuesText
                        .split(/[,，、]/)
                        .map((v) => v.trim())
                        .filter(Boolean),
                ),
            ]
            if (!name) {
                setError("规格维度名不能为空")
                return
            }
            if (values.length === 0) {
                setError(`「${name}」至少需要一个取值`)
                return
            }
            specs.push({ name, values })
        }
        onSave(specs)
    }

    return (
        <div className="space-y-3">
            {drafts.map((d, i) => (
                <div
                    key={d.id}
                    className="flex items-start gap-2"
                >
                    <Input
                        className="w-40"
                        placeholder="维度名，如 颜色"
                        maxLength={32}
                        value={d.name}
                        onChange={(e) => update(i, { name: e.target.value })}
                    />
                    <Input
                        className="flex-1"
                        placeholder="取值，逗号分隔，如 黑色，白色"
                        value={d.valuesText}
                        onChange={(e) => update(i, { valuesText: e.target.value })}
                    />
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="删除维度"
                        onClick={() => setDrafts((ds) => ds.filter((_, j) => j !== i))}
                    >
                        <Trash2 className="size-4 text-muted-foreground" />
                    </Button>
                </div>
            ))}

            <div className="flex items-center gap-2">
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                        setDrafts((ds) => [...ds, { id: nextDraftId(), name: "", valuesText: "" }])
                    }
                >
                    <Plus className="size-4" />
                    添加维度
                </Button>
                <Button
                    type="button"
                    size="sm"
                    disabled={submitting}
                    onClick={handleSave}
                    className="bg-brand text-brand-foreground hover:bg-brand-hover"
                >
                    {submitting ? "保存中…" : "保存规格"}
                </Button>
            </div>

            {error ? (
                <p className="flex items-center gap-1.5 text-sm text-destructive">
                    <CircleAlert className="size-4" />
                    {error}
                </p>
            ) : null}

            <p className="text-xs text-muted-foreground">
                保存规格会按各维度取值的笛卡尔积重新对账 SKU：组合不变的保留，新组合生成新
                SKU，需要再到下方 SKU 表设置价格和库存。
            </p>
        </div>
    )
}
