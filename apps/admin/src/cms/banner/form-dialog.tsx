import type { BannerResponse } from "@shop/api/sdk"

import { serverFieldErrors, submitForm } from "@shop/app-kit/forms"
import { useI18n } from "@shop/app-kit/i18n"
import { Dialog, DialogContent, applyServerFieldErrors, useAppForm } from "@shop/ui-web"

import { CMS_SUBTITLE_MAX, CMS_TITLE_MAX } from "../constants"
import { CmsFormBody, sortOrderField, targetField, targetTypeField } from "../form-dialog"
import { useT } from "#/locales/use-t"
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
    const t = useT()

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
                    serverFieldErrors(error, {
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
            title={
                editing
                    ? t("admin.cms.banner.form.editTitle")
                    : t("admin.cms.banner.form.createTitle")
            }
            busy={busy}
            onSubmit={() => submitForm(form)}
            onCancel={() => onOpenChange(false)}
        >
            <form.AppField name="slot">
                {(field) => (
                    <field.TextField
                        label={t("admin.cms.field.slot")}
                        required
                        placeholder={t("admin.cms.banner.form.slotPlaceholder")}
                        disabled={Boolean(editing)}
                    />
                )}
            </form.AppField>
            <form.AppField name="sortOrder">{sortOrderField(t)}</form.AppField>

            <form.AppField name="title">
                {(field) => (
                    <field.TextField
                        className="col-span-2"
                        label={t("admin.cms.field.title")}
                        required
                        maxLength={CMS_TITLE_MAX}
                    />
                )}
            </form.AppField>
            <form.AppField name="subtitle">
                {(field) => (
                    <field.TextField
                        className="col-span-2"
                        label={t("admin.cms.form.subtitle")}
                        maxLength={CMS_SUBTITLE_MAX}
                    />
                )}
            </form.AppField>
            <form.AppField name="imageUrl">
                {(field) => (
                    <field.TextField
                        className="col-span-2"
                        label={t("admin.cms.form.imageUrl")}
                        required
                        placeholder="https://…"
                    />
                )}
            </form.AppField>

            <form.AppField name="targetType">{targetTypeField(t)}</form.AppField>
            <form.AppField name="target">{targetField(t)}</form.AppField>
            <form.AppField name="link">
                {(field) => (
                    <field.TextField
                        className="col-span-2"
                        label={t("admin.cms.banner.form.linkLabel")}
                        placeholder={t("admin.cms.banner.form.linkPlaceholder")}
                    />
                )}
            </form.AppField>

            <form.AppField name="startAt">
                {(field) => (
                    <field.DateTimeField
                        label={t("admin.cms.form.startAt")}
                        hint={t("admin.cms.form.startAtHint")}
                        locale={locale}
                    />
                )}
            </form.AppField>
            <form.AppField name="endAt">
                {(field) => (
                    <field.DateTimeField
                        label={t("admin.cms.form.endAt")}
                        hint={t("admin.cms.form.endAtHint")}
                        locale={locale}
                    />
                )}
            </form.AppField>
        </CmsFormBody>
    )
}
