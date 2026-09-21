import { useState } from "react"
import { Plus } from "lucide-react"
import { Badge, Button, FieldSet } from "@shop/ui-web"

import type { SpecSelection } from "#/product/draft-model"
import type { CategoryAttrNodeResponse } from "@shop/api/sdk"

import { AttrValueRow, type ValueDraft } from "./AttrValueRow"

// ── 内部草稿形状 ──

interface AttrDraft {
    attrId: string
    name: string
    allowCustom: boolean
    /** 该规格是否允许每个取值上传配图（后端类目模板 allow_image） */
    allowImage: boolean
    values: CategoryAttrNodeResponse["values"]
    rows: ValueDraft[]
}

let seq = 0
const nextId = () => `v-${++seq}`

function toDrafts(nodes: CategoryAttrNodeResponse[], selected: SpecSelection[]): AttrDraft[] {
    return nodes.map((n) => {
        const sel = selected.find((s) => s.attrId === n.attr.id)
        // 模板取值按 id 建一次索引，避免回显时对每个已选值线性扫描 values
        const valueById = new Map(n.values.map((v) => [v.id, v]))
        const rows: ValueDraft[] = []
        for (const vid of sel?.valueIds ?? []) {
            const v = valueById.get(vid)
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
            allowImage: n.attr.allowImage,
            values: n.values,
            rows,
        }
    })
}

function toSelections(drafts: AttrDraft[]): SpecSelection[] {
    const withRows = drafts.filter((d) => d.rows.some((r) => r.value.trim()))
    return withRows.map((d) => {
        const valueIds = d.rows
            .filter(
                (r): r is ValueDraft & { valueId: string } => !!r.valueId && r.value.trim() !== "",
            )
            .map((r) => r.valueId)
        const customValues = d.rows
            .filter((r) => !r.valueId && r.value.trim())
            .map((r) => r.value.trim())
        // 取值图：仅收集「有值且有图」的，随规格选择上抛，后端落到 category_attr_values.image
        const valueImages: Record<string, string> = {}
        for (const r of d.rows)
            if (r.valueId && r.value.trim() && r.image) valueImages[r.valueId] = r.image
        const customValueImages: Record<string, string> = {}
        for (const r of d.rows) {
            const v = r.value.trim()
            if (!r.valueId && v && r.image) customValueImages[v] = r.image
        }
        return {
            attrId: d.attrId,
            valueIds,
            customValues,
            valueImages: Object.keys(valueImages).length > 0 ? valueImages : undefined,
            customValueImages:
                Object.keys(customValueImages).length > 0 ? customValueImages : undefined,
        }
    })
}

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
    disabled,
    onChange,
    uploadImage,
}: {
    /** 类目属性模板节点（调用方需已过滤出 kind=1 销售属性） */
    attrs: CategoryAttrNodeResponse[]
    value: SpecSelection[]
    /** 上架商品规格冻结：禁用整块（fieldset 一次禁用内部所有输入/按钮），值仍回显只读 */
    disabled?: boolean
    onChange: (selections: SpecSelection[]) => void
    /** 取值配图上传（绑定当前店铺，凭证需 X-Shop-Id） */
    uploadImage: (file: File) => Promise<string>
}) {
    // drafts 与「其来源 value 引用」同存一体：外部灌值（编辑回显 hydrate）必然带来新引用 → 渲染期重建；
    // 自回声（emit 上抛的同一数组经父级回传）引用未变，不触发，无需序列化比较。
    const [draftState, setDraftState] = useState(() => ({
        source: value,
        drafts: toDrafts(attrs, value),
    }))
    if (
        value !== draftState.source &&
        JSON.stringify(value) !== JSON.stringify(draftState.source)
    ) {
        // oxlint-disable-next-line react-doctor/no-adjust-state-on-prop-change -- 渲染期识别外部灌值并重建，是 React 官方的 adjusting state during render 模式
        setDraftState({ source: value, drafts: toDrafts(attrs, value) })
    }
    const drafts = draftState.drafts

    function emit(next: AttrDraft[]) {
        const selections = toSelections(next)
        setDraftState({ source: selections, drafts: next })
        onChange(selections)
    }

    function updateValue(attrIdx: number, rowIdx: number, text: string) {
        const d = drafts[attrIdx]
        if (!d) return
        const match = d.values.find((v) => v.value === text.trim())
        const current = d.rows[rowIdx]
        if (!current) return
        const rows = d.rows.with(rowIdx, { ...current, value: text, valueId: match?.id })
        emit(drafts.map((a, i) => (i === attrIdx ? { ...a, rows } : a)))
    }

    function updateNote(attrIdx: number, rowIdx: number, note: string) {
        const d = drafts[attrIdx]
        if (!d) return
        // oxlint-disable-next-line oxc/no-map-spread -- React 状态不可变更新（copy-on-write），对象展开是唯一写法
        const rows = d.rows.map((r, i) => (i === rowIdx ? { ...r, note } : r))
        emit(drafts.map((a, i) => (i === attrIdx ? { ...a, rows } : a)))
    }

    function addRow(attrIdx: number) {
        const d = drafts[attrIdx]
        if (!d) return
        const rows = [...d.rows, { id: nextId(), value: "", note: "" }]
        emit(drafts.map((a, i) => (i === attrIdx ? { ...a, rows } : a)))
    }

    function updateImage(attrIdx: number, rowIdx: number, image: string | undefined) {
        const d = drafts[attrIdx]
        if (!d) return
        // oxlint-disable-next-line oxc/no-map-spread -- React 状态不可变更新（copy-on-write），对象展开是唯一写法
        const rows = d.rows.map((r, i) => (i === rowIdx ? { ...r, image: image ?? "" } : r))
        emit(drafts.map((a, i) => (i === attrIdx ? { ...a, rows } : a)))
    }

    function removeRow(attrIdx: number, rowIdx: number) {
        const d = drafts[attrIdx]
        if (!d) return
        const rows = d.rows.filter((_, i) => i !== rowIdx)
        emit(drafts.map((a, i) => (i === attrIdx ? { ...a, rows } : a)))
    }

    return (
        <FieldSet
            disabled={disabled}
            className="min-w-0"
        >
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
                            <Badge variant="secondary">重要</Badge>
                        </div>

                        {/* 取值行列表：定宽紧凑行，约 2 个/行（不撑满整行，留白）；「+」跟在最后一个取值行后面同排 */}
                        <div className="flex flex-wrap items-center gap-2">
                            {d.rows.map((row, ri) => (
                                <AttrValueRow
                                    key={row.id}
                                    row={row}
                                    showImage={d.allowImage}
                                    allowCustom={d.allowCustom}
                                    values={d.values.map((v) => v.value)}
                                    removable={d.rows.length > 1}
                                    onValueChange={(text) => updateValue(ai, ri, text)}
                                    onNoteChange={(note) => updateNote(ai, ri, note)}
                                    onImageChange={(img) => updateImage(ai, ri, img)}
                                    onRemove={() => removeRow(ai, ri)}
                                    upload={uploadImage}
                                />
                            ))}

                            <Button
                                variant="outline"
                                size="icon-lg"
                                onClick={() => addRow(ai)}
                                aria-label="添加取值"
                            >
                                <Plus className="size-4" />
                            </Button>
                        </div>
                    </div>
                ))}
            </div>
        </FieldSet>
    )
}
