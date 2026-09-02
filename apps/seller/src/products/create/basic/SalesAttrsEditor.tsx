import { useState } from "react"
import { ImageIcon, Plus, Trash2 } from "lucide-react"
import { Badge, Button, Input } from "@shop/ui-web"

import type { CategoryAttrTemplateNode, SpecSelection } from "../../data"

/**
 * 销售属性编辑器（千牛式逐行取值）。
 *
 * 一个维度（销售属性）一个块：头部（名 + 取值数 + 重要徽标）→ 取值行列表
 * （图片占位 + 取值输入 + 备注 + 删除）→ 「添加取值」。
 *
 * 取值输入走模板值域 autocomplete（原生 datalist）+ 自由输入：命中模板值记 valueId，
 * 值域外文本视为自定义值（customValues，提交时后端 auto 建档，允许 allowCustom）。
 *
 * 说明：备注（note）本期只作 UI 占位，后端取值模型无 note 字段，提交时丢弃；取值图上传接口未接，
 * 图片按钮仅占位（按维度名是否含「颜色/色」判断是否提供，占位性规则）。
 */
export function SalesAttrsEditor({
    attrs,
    value,
    onChange,
}: {
    /** 类目属性模板节点（调用方需已过滤出 kind=1 销售属性） */
    attrs: CategoryAttrTemplateNode[]
    value: SpecSelection[]
    onChange: (selections: SpecSelection[]) => void
}) {
    const [drafts, setDrafts] = useState<AttrDraft[]>(() => toDrafts(attrs, value))

    function emit(next: AttrDraft[]) {
        setDrafts(next)
        onChange(toSelections(next))
    }

    function updateValue(attrIdx: number, rowIdx: number, text: string) {
        const d = drafts[attrIdx]
        const match = d.values.find((v) => v.value === text.trim())
        const rows = d.rows.map((r, i) =>
            i === rowIdx ? { ...r, value: text, valueId: match?.id } : r,
        )
        emit(drafts.map((a, i) => (i === attrIdx ? { ...a, rows } : a)))
    }

    function updateNote(attrIdx: number, rowIdx: number, note: string) {
        const rows = drafts[attrIdx].rows.map((r, i) => (i === rowIdx ? { ...r, note } : r))
        emit(drafts.map((a, i) => (i === attrIdx ? { ...a, rows } : a)))
    }

    function addRow(attrIdx: number) {
        const rows = [...drafts[attrIdx].rows, { id: nextId(), value: "", note: "" }]
        emit(drafts.map((a, i) => (i === attrIdx ? { ...a, rows } : a)))
    }

    function removeRow(attrIdx: number, rowIdx: number) {
        const rows = drafts[attrIdx].rows.filter((_, i) => i !== rowIdx)
        emit(drafts.map((a, i) => (i === attrIdx ? { ...a, rows } : a)))
    }

    return (
        <div className="divide-y divide-border">
            {drafts.map((d, ai) => (
                <div
                    key={d.attrId}
                    className="py-4 first:pt-0 last:pb-0"
                >
                    {/* 维度头：名 + 取值数 + 重要徽标*/}
                    <div className="mb-3 flex items-center gap-2">
                        <span className="text-sm">{d.name}</span>
                        <span className="text-xs text-muted-foreground">({d.rows.length})</span>
                        <Badge variant="warning">重要</Badge>
                    </div>

                    {/* 取值行列表：定宽 22rem 自动换行，不撑满内容区 */}
                    <div className="flex flex-wrap gap-2">
                        {d.rows.map((row, ri) => (
                            <div
                                key={row.id}
                                className="flex w-88 items-center gap-2"
                            >
                                {supportsImage(d.name) && (
                                    <button
                                        type="button"
                                        aria-label="规格图上传待接入"
                                        className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-dashed border-border text-muted-foreground/60"
                                    >
                                        <ImageIcon className="size-4" />
                                    </button>
                                )}
                                <div className="flex min-w-0 flex-1 items-center rounded-lg border border-input bg-background focus-within:ring-2 focus-within:ring-ring/40">
                                    <Input
                                        value={row.value}
                                        placeholder={
                                            d.allowCustom ? "输入或选择取值" : "请选择取值"
                                        }
                                        className="h-9 min-w-0 flex-1 border-0 bg-transparent shadow-none focus-visible:border-transparent focus-visible:ring-0"
                                        onChange={(e) => updateValue(ai, ri, e.target.value)}
                                    />
                                    <Input
                                        value={row.note}
                                        placeholder="备注(可选)"
                                        className="h-9 w-28 shrink-0 border-0 border-l border-input bg-transparent shadow-none focus-visible:border-transparent focus-visible:ring-0"
                                        onChange={(e) => updateNote(ai, ri, e.target.value)}
                                    />
                                </div>
                                {d.rows.length > 1 && (
                                    <Button
                                        variant="ghost"
                                        size="icon-lg"
                                        onClick={() => removeRow(ai, ri)}
                                        aria-label="删除取值"
                                        className="hover:text-destructive"
                                    >
                                        <Trash2 className="size-4" />
                                    </Button>
                                )}
                            </div>
                        ))}

                        {/* 「+」跟在最后一个取值行后面（flex 流内，行尾有空位就同行，不强行另起一行） */}
                        <Button
                            variant="ghost"
                            size="icon-lg"
                            onClick={() => addRow(ai)}
                            aria-label="添加取值"
                            className="border border-dashed border-input hover:border-primary hover:text-primary"
                        >
                            <Plus className="size-4" />
                        </Button>
                    </div>

                    {/* 模板值域（原生 datalist 供取值行 autocomplete） */}
                    <datalist id={`dv-${d.attrId}`}>
                        {d.values.map((v) => (
                            <option
                                key={v.id}
                                value={v.value}
                            >
                                {v.value}
                            </option>
                        ))}
                    </datalist>
                </div>
            ))}
        </div>
    )
}

// ── 内部草稿形状 ──

interface ValueDraft {
    id: string
    /** 模板值 id；无 = 自定义值 */
    valueId?: string
    value: string
    note: string
}

interface AttrDraft {
    attrId: string
    name: string
    allowCustom: boolean
    values: CategoryAttrTemplateNode["values"]
    rows: ValueDraft[]
}

let seq = 0
const nextId = () => `v-${++seq}`

/** 销售属性维度是否「取值带图」（占位性判定：名字含 颜色/色；后端上传未接，先只渲染占位按钮） */
const supportsImage = (name: string) => /颜色|色/.test(name)

function toDrafts(nodes: CategoryAttrTemplateNode[], selected: SpecSelection[]): AttrDraft[] {
    return nodes.map((n) => {
        const sel = selected.find((s) => s.attrId === n.attr.id)
        const rows: ValueDraft[] = []
        for (const vid of sel?.valueIds ?? []) {
            const v = n.values.find((x) => x.id === vid)
            rows.push({ id: nextId(), valueId: vid, value: v?.value ?? "", note: "" })
        }
        for (const cv of sel?.customValues ?? []) {
            rows.push({ id: nextId(), value: cv, note: "" })
        }
        if (rows.length === 0) rows.push({ id: nextId(), value: "", note: "" })
        return {
            attrId: n.attr.id,
            name: n.attr.name,
            allowCustom: n.attr.allowCustom,
            values: n.values,
            rows,
        }
    })
}

function toSelections(drafts: AttrDraft[]): SpecSelection[] {
    const withRows = drafts.filter((d) => d.rows.some((r) => r.value.trim()))
    return withRows.map((d) => ({
        attrId: d.attrId,
        valueIds: d.rows.filter((r) => r.valueId && r.value.trim()).map((r) => r.valueId as string),
        customValues: d.rows.filter((r) => !r.valueId && r.value.trim()).map((r) => r.value.trim()),
    }))
}

export { type ValueDraft }
