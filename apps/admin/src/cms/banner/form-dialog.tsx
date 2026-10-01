import type { BannerResponse } from "@shop/api/sdk"

import { serverFieldErrorTexts, submitForm } from "@shop/app-kit/forms"
import { useI18n } from "@shop/app-kit/i18n"
import { Dialog, DialogContent, applyServerFieldErrors, useAppForm } from "@shop/ui-web"

import { CMS_SUBTITLE_MAX, CMS_TITLE_MAX } from "../constants"
import { CmsFormBody, sortOrderField, targetField, targetTypeField } from "../form-dialog"
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

/** 新增/编辑运营位 banner 表单（跳转类型 NONE = 不跳转，提交时投影成缺省）。
    表单体挂在 DialogContent 里：BaseUI 关闭即卸载，每次打开重挂载让默认值从当前 editing 重算。 */
export function BannerFormDialog({ open, onOpenChange, ...props }: BannerFormDialogProps) {
    return (
        <Dialog
            open={open}
            onOpenChange={onOpenChange}
        >
            <DialogContent className="sm:max-w-xl">
                <BannerForm
                    {...props}
                    onOpenChange={onOpenChange}
                />
            </DialogContent>
        </Dialog>
    )
}

function BannerForm({ editing, defaultSlot, onOpenChange }: Omit<BannerFormDialogProps, "open">) {
    const create = useCreateBanner()
    const update = useUpdateBanner()
    const busy = create.isPending || update.isPending
    const { locale } = useI18n()

    const form = useAppForm({
        defaultValues: bannerDefaults(editing, defaultSlot),
        validators: { onSubmit: BannerFormSchema },
        onSubmit: async ({ value }) => {
            const input = toBannerRequest(value)
            try {
                await (editing
                    ? update.mutateAsync({ id: editing.id, input })
                    : create.mutateAsync(input))
            } catch (error) {
                // BannerRequest 的注解落点全部同名（slot/title/subtitle/imageUrl/target/link 的
                // 长度档、targetType 的 @Pattern、sortOrder 的整数位）；startAt / endAt 无校验注解
                // 且是时间格，不进白名单
                applyServerFieldErrors(
                    form,
                    serverFieldErrorTexts(error, locale, {
                        slot: "slot",
                        title: "title",
                        subtitle: "subtitle",
                        imageUrl: "imageUrl",
                        target: "target",
                        targetType: "targetType",
                        link: "link",
                        sortOrder: "sortOrder",
                    }),
                )
                throw error
            }
            onOpenChange(false)
        },
    })

    return (
        <CmsFormBody
            title={editing ? "编辑运营位" : "新增运营位"}
            busy={busy}
            onSubmit={() => submitForm(form)}
            onCancel={() => onOpenChange(false)}
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
            <form.AppField name="sortOrder">{sortOrderField}</form.AppField>

            <form.AppField name="title">
                {(field) => (
                    <field.TextField
                        className="col-span-2"
                        label="主标题"
                        required
                        maxLength={CMS_TITLE_MAX}
                    />
                )}
            </form.AppField>
            <form.AppField name="subtitle">
                {(field) => (
                    <field.TextField
                        className="col-span-2"
                        label="副标题"
                        maxLength={CMS_SUBTITLE_MAX}
                    />
                )}
            </form.AppField>
            <form.AppField name="imageUrl">
                {(field) => (
                    <field.TextField
                        className="col-span-2"
                        label="图片地址"
                        required
                        placeholder="https://…"
                    />
                )}
            </form.AppField>

            <form.AppField name="targetType">{targetTypeField}</form.AppField>
            <form.AppField name="target">{targetField}</form.AppField>
            <form.AppField name="link">
                {(field) => (
                    <field.TextField
                        className="col-span-2"
                        label="兜底链接"
                        placeholder="URL 型跳转时填写（可选）"
                    />
                )}
            </form.AppField>

            <form.AppField name="startAt">
                {(field) => (
                    <field.DateTimeField
                        label="定时上线"
                        hint="留空 = 立即生效"
                    />
                )}
            </form.AppField>
            <form.AppField name="endAt">
                {(field) => (
                    <field.DateTimeField
                        label="定时下线"
                        hint="留空 = 长期有效"
                    />
                )}
            </form.AppField>
        </CmsFormBody>
    )
}
