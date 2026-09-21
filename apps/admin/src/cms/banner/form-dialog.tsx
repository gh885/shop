import { useEffect } from "react"
import type { BannerResponse } from "@shop/api/sdk"

import {
    Button,
    Dialog,
    DialogContent,
    DialogTitle,
    SelectItem,
    Spinner,
    useAppForm,
} from "@shop/ui-web"

import { TARGET_TYPE_LABEL } from "../constants"
import { bannerDefaults, BannerFormSchema, toBannerRequest } from "./form"
import { useCreateBanner, useUpdateBanner } from "./queries"

export interface BannerFormDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    /** 传入则为编辑（slot 不可改）；未传为新增 */
    editing?: BannerResponse
    /** 新增时预填当前筛选的运营位 */
    defaultSlot?: string
}

/** 新增/编辑运营位 banner 表单（跳转类型 NONE = 不跳转，提交时投影成缺省） */
export function BannerFormDialog({
    open,
    onOpenChange,
    editing,
    defaultSlot,
}: BannerFormDialogProps) {
    const create = useCreateBanner()
    const update = useUpdateBanner()
    const busy = create.isPending || update.isPending

    const form = useAppForm({
        defaultValues: bannerDefaults(editing, defaultSlot),
        validators: { onSubmit: BannerFormSchema },
        onSubmit: async ({ value }) => {
            const input = toBannerRequest({
                ...value,
                targetType: value.targetType === "NONE" ? undefined : value.targetType,
            })
            if (editing) {
                await update.mutateAsync({ id: editing.id, input })
            } else {
                await create.mutateAsync(input)
            }
            onOpenChange(false)
        },
    })

    useEffect(() => {
        if (open) form.reset(bannerDefaults(editing, defaultSlot))
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, editing])

    return (
        <Dialog
            open={open}
            onOpenChange={onOpenChange}
        >
            <DialogContent className="sm:max-w-xl">
                <DialogTitle>{editing ? "编辑运营位" : "新增运营位"}</DialogTitle>

                <form
                    className="mt-4 grid grid-cols-2 gap-x-4 gap-y-5"
                    onSubmit={(e) => {
                        e.preventDefault()
                        void form.handleSubmit()
                    }}
                >
                    <form.AppField name="slot">
                        {(field) => (
                            <field.TextField
                                label="运营位"
                                required
                                placeholder="如 home_promo"
                                disabled={Boolean(editing)}
                            />
                        )}
                    </form.AppField>
                    <form.AppField name="sortOrder">
                        {(field) => (
                            <field.TextField
                                label="排序值"
                                placeholder="0"
                                inputMode="numeric"
                                hint="越小越靠前"
                            />
                        )}
                    </form.AppField>

                    <div className="col-span-2">
                        <form.AppField name="title">
                            {(field) => (
                                <field.TextField
                                    label="主标题"
                                    required
                                    maxLength={64}
                                />
                            )}
                        </form.AppField>
                    </div>
                    <div className="col-span-2">
                        <form.AppField name="subtitle">
                            {(field) => (
                                <field.TextField
                                    label="副标题"
                                    maxLength={128}
                                />
                            )}
                        </form.AppField>
                    </div>
                    <div className="col-span-2">
                        <form.AppField name="imageUrl">
                            {(field) => (
                                <field.TextField
                                    label="图片地址"
                                    required
                                    placeholder="https://…"
                                />
                            )}
                        </form.AppField>
                    </div>

                    <form.AppField name="targetType">
                        {(field) => (
                            <field.SelectField label="跳转类型">
                                <SelectItem value="NONE">不跳转</SelectItem>
                                {Object.entries(TARGET_TYPE_LABEL).map(([value, label]) => (
                                    <SelectItem
                                        key={value}
                                        value={value}
                                    >
                                        {label}
                                    </SelectItem>
                                ))}
                            </field.SelectField>
                        )}
                    </form.AppField>
                    <form.AppField name="target">
                        {(field) => (
                            <field.TextField
                                label="跳转目标"
                                placeholder="商品/类目 ID、活动名或搜索词"
                            />
                        )}
                    </form.AppField>
                    <div className="col-span-2">
                        <form.AppField name="link">
                            {(field) => (
                                <field.TextField
                                    label="兜底链接"
                                    placeholder="URL 型跳转时填写（可选）"
                                />
                            )}
                        </form.AppField>
                    </div>

                    <form.AppField name="startAt">
                        {(field) => (
                            <field.TextField
                                label="定时上线"
                                type="datetime-local"
                                hint="留空 = 立即生效"
                            />
                        )}
                    </form.AppField>
                    <form.AppField name="endAt">
                        {(field) => (
                            <field.TextField
                                label="定时下线"
                                type="datetime-local"
                                hint="留空 = 长期有效"
                            />
                        )}
                    </form.AppField>

                    <div className="col-span-2 mt-2 flex justify-end gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                        >
                            取消
                        </Button>
                        <Button
                            type="submit"
                            disabled={busy}
                        >
                            {busy && <Spinner />}
                            保存
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    )
}
