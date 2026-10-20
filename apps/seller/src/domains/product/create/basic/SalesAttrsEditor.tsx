import { useEffect, useRef, useState } from "react"
import { Plus } from "lucide-react"
import { SPEC_VALUES_MAX } from "@shop/common/domain"
import { Badge, Button, FieldSet } from "@shop/ui-web"

import {
    type AttrDraft,
    createValueRowId,
    draftsToSelections,
    selectionsToDrafts,
    type SpecSelection,
} from "#/domains/product/draft-rules"
import { useT } from "#/locales/use-t"
import type { CategoryAttrNodeResponse } from "@shop/api/sdk"

import { AttrValueRow } from "./AttrValueRow"

export function SalesAttrsEditor({
    attrs,
    value,
    disabled,
    onChange,
    uploadImage,
}: {
    attrs: CategoryAttrNodeResponse[]
    value: SpecSelection[]
    disabled?: boolean
    onChange: (selections: SpecSelection[]) => void
    uploadImage: (file: File) => Promise<string>
}) {
    const t = useT("product")
    // drafts 与来源 value 引用同存：外部灌值(新引用)才渲染期重建；自回声(emit 上抛的同一数组回传)引用不变不触发，免序列化比较
    const [nextId] = useState(createValueRowId)
    const [draftState, setDraftState] = useState(() => ({
        source: value,
        drafts: selectionsToDrafts(attrs, value, nextId),
    }))
    if (
        value !== draftState.source &&
        JSON.stringify(value) !== JSON.stringify(draftState.source)
    ) {
        // oxlint-disable-next-line react-doctor/no-adjust-state-on-prop-change -- 渲染期识别外部灌值并重建，是 React 官方 adjusting-state-during-render 模式
        setDraftState({ source: value, drafts: selectionsToDrafts(attrs, value, nextId) })
    }
    const drafts = draftState.drafts
    // 上传是异步回调，渲染期闭包里的 drafts 已过期；经 ref 取最新，否则吞掉上传期间其它改动（含并发上传的别的行）
    const latestDrafts = useRef(drafts)
    useEffect(() => {
        latestDrafts.current = drafts
    }, [drafts])

    function emit(next: AttrDraft[]) {
        const selections = draftsToSelections(next)
        latestDrafts.current = next
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
        if (!d || d.rows.length >= SPEC_VALUES_MAX) return
        const rows = [...d.rows, { id: nextId(), value: "", note: "" }]
        emit(drafts.map((a, i) => (i === attrIdx ? { ...a, rows } : a)))
    }

    function updateImage(attrId: string, rowId: string, image: string | undefined) {
        // 按 id 定位：上传期间行可能被删/挪，下标不可信
        const latest = latestDrafts.current
        const attrIdx = latest.findIndex((a) => a.attrId === attrId)
        const d = latest[attrIdx]
        if (!d) return
        // oxlint-disable-next-line oxc/no-map-spread -- React 状态不可变更新（copy-on-write），对象展开是唯一写法
        const rows = d.rows.map((r) => (r.id === rowId ? { ...r, image: image ?? "" } : r))
        // oxlint-disable-next-line oxc/no-map-spread -- 同上
        emit(latest.map((a, i) => (i === attrIdx ? { ...a, rows } : a)))
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
                {drafts.map((d, ai) => {
                    const valuesFull = d.rows.length >= SPEC_VALUES_MAX
                    return (
                        <div
                            key={d.attrId}
                            className="py-4 first:pt-0 last:pb-0"
                        >
                            <div className="mb-3 flex items-center gap-2">
                                <span className="text-sm">{d.name}</span>
                                <span className="text-xs text-muted-foreground">
                                    {valuesFull
                                        ? `${d.rows.length}/${SPEC_VALUES_MAX}`
                                        : `(${d.rows.length})`}
                                </span>
                                <Badge variant="secondary">{t("product.attrs.important")}</Badge>
                            </div>

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
                                        onImageChange={(img) => updateImage(d.attrId, row.id, img)}
                                        onRemove={() => removeRow(ai, ri)}
                                        upload={uploadImage}
                                    />
                                ))}

                                {/* 到档就停手：超过上限再加取值提交必 400（后端同一档在 SpecSelectionRequest） */}
                                <Button
                                    variant="outline"
                                    size="icon-lg"
                                    onClick={() => addRow(ai)}
                                    disabled={valuesFull}
                                    title={
                                        valuesFull
                                            ? t("product.attrs.maxReached", {
                                                  max: SPEC_VALUES_MAX,
                                              })
                                            : undefined
                                    }
                                    aria-label={t("product.attrs.addAria")}
                                >
                                    <Plus className="size-4" />
                                </Button>
                            </div>
                        </div>
                    )
                })}
            </div>
        </FieldSet>
    )
}
