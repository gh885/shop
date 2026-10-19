import { Trash2 } from "lucide-react"
import { SPEC_VALUE_MAX } from "@shop/common/domain"
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
import { useT } from "#/locales/use-t"
import type { ValueDraft } from "#/product/draft-rules"

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
    showImage: boolean
    allowCustom: boolean
    values: string[]
    removable: boolean
    onValueChange: (value: string) => void
    onNoteChange: (note: string) => void
    onImageChange: (image: string | undefined) => void
    onRemove: () => void
    upload?: (file: File) => Promise<string>
}) {
    const t = useT("product")
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
            {/* Combobox 必须受控（value+inputValue）：回显时父级重建草稿行改 row.value，用 defaultValue 会触发 Base UI 告警且回显值不更新 */}
            <Combobox
                items={values}
                // oxlint-disable-next-line no-null -- Base UI Combobox value=null 表示无选中，库 API 要求
                value={row.value || null}
                inputValue={row.value}
                onValueChange={(v) => onValueChange(v ?? "")}
                onInputValueChange={(text) => onValueChange(text)}
            >
                <ComboboxInput
                    placeholder={t(
                        allowCustom
                            ? "product.attrs.value.placeholderCustom"
                            : "product.attrs.value.placeholderSelect",
                    )}
                    className="h-9! w-56 shrink-0"
                    maxLength={SPEC_VALUE_MAX}
                />
                <ComboboxContent>
                    <ComboboxEmpty>{t("product.attrs.value.comboboxEmpty")}</ComboboxEmpty>
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
                placeholder={t("product.attrs.value.notePlaceholder")}
                className="h-9! w-20 shrink-0"
                onChange={(e) => onNoteChange(e.target.value)}
            />
            {removable && (
                <Button
                    variant="destructive"
                    size="icon-lg"
                    onClick={onRemove}
                    aria-label={t("product.attrs.value.removeAria")}
                >
                    <Trash2 className="size-4" />
                </Button>
            )}
        </div>
    )
}
