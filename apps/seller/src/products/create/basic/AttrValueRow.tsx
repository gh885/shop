import { Trash2 } from "lucide-react"
import {
    Button,
    Combobox,
    ComboboxContent,
    ComboboxEmpty,
    ComboboxInput,
    ComboboxItem,
    ComboboxList,
    ImageUpload,
    Input,
} from "@shop/ui-web"

import { imgUrl } from "#/shared/lib/image"

/** 一个「取值行」的草稿形状：id 稳定拼接；命中模板值记 valueId，否则视为自定义值 */
export interface ValueDraft {
    id: string
    /** 命中模板值的 id；无 = 自定义值 */
    valueId?: string
    value: string
    /** 取值图（如颜色所对应的色块图）；本期仅 UI 占位，后端取值模型暂无该字段，提交时丢弃 */
    image?: string
    /** 备注：本期仅 UI 占位，后端取值无该字段，提交时丢弃 */
    note: string
}

/**
 * 销售属性「取值行」：图片占位 + 取值输入（模板值域 autocomplete）+ 备注输入 + 删除。
 *
 * 纯展示、完全受控：不持有任何状态，只把输入上抛。父级(SalesAttrsEditor)负责下标编排，
 * 以及 valueId 推导（命中模板值 → 记 valueId，否则算自定义值）等业务。
 *
 * 取值输入用 Combobox（BaseUI）：聚焦/键入弹下拉列出模板值供点选，也可直接输入自定义值。
 * 值列表 values 由父级传入（该维度模板取值文本）；弹层经 Portal 渲染，不受外层 overflow-hidden 裁剪。
 */
export function AttrValueRow({
    row,
    showImage,
    allowCustom,
    values,
    removable,
    onValueChange,
    onNoteChange,
    onImageChange,
    onRemove,
    upload,
}: {
    row: ValueDraft
    /** 是否渲染「取值图」上传（按维度名含颜色/色判定） */
    showImage: boolean
    /** 是否允许自定义取值（决定输入占位文案） */
    allowCustom: boolean
    /** 该维度的模板取值文本（供下拉选择） */
    values: string[]
    /** 是否可删除（通常 = 该维度取值行数 > 1） */
    removable: boolean
    /** 取值输入变化上抛原始文本（valueId 推导由父级做） */
    onValueChange: (value: string) => void
    onNoteChange: (note: string) => void
    /** 取值图变化上抛（上传完成给地址，删除给 undefined） */
    onImageChange: (image: string | undefined) => void
    onRemove: () => void
    /** 取值图上传函数（直传七牛）；不传用本地预览 */
    upload?: (file: File) => Promise<string>
}) {
    return (
        <div className="flex w-fit min-w-0 items-center gap-1.5">
            {showImage && (
                <ImageUpload
                    value={row.image || undefined}
                    onChange={onImageChange}
                    shape="tile"
                    size="size-9"
                    upload={upload}
                    resolveSrc={imgUrl}
                />
            )}
            {/* 取值：自成一框的下拉输入（带展开箭头，InputGroup 由 ComboboxInput 提供）
                备注：独立小输入框，与取值同高、紧凑并排

                ⚠ 必须**受控**（value + onValueChange + inputValue）：编辑回显时父级会重建草稿行、改变 row.value，
                若用 defaultValue（非受控）会触发 Base UI「初始化后改变 uncontrolled 默认值」告警，且回显值不更新。
                受控 inputValue 让自定义取值（不在模板值域内）也能在回显时如实显示；命中模板值由父级映射 valueId。 */}
            <Combobox
                items={values}
                value={row.value || null}
                inputValue={row.value ?? ""}
                onValueChange={(v) => v != null && onValueChange(String(v))}
                onInputValueChange={(text) => onValueChange(text)}
            >
                <ComboboxInput
                    placeholder={allowCustom ? "输入或选择取值" : "请选择取值"}
                    className="h-9! w-56 shrink-0"
                />
                <ComboboxContent>
                    <ComboboxEmpty>无匹配取值，可直接输入</ComboboxEmpty>
                    <ComboboxList className="max-h-60">
                        {(item) => (
                            <ComboboxItem
                                key={item}
                                value={item}
                            >
                                {item}
                            </ComboboxItem>
                        )}
                    </ComboboxList>
                </ComboboxContent>
            </Combobox>
            <Input
                value={row.note}
                placeholder="备注"
                className="h-9! w-20 shrink-0"
                onChange={(e) => onNoteChange(e.target.value)}
            />
            {removable && (
                <Button
                    variant="ghost"
                    size="icon-lg"
                    onClick={onRemove}
                    aria-label="删除取值"
                    className="hover:text-destructive"
                >
                    <Trash2 className="size-4" />
                </Button>
            )}
        </div>
    )
}
