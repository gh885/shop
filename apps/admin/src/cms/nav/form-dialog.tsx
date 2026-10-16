import { useState } from "react"
import type { NavEntryResponse } from "@shop/api/sdk"

import { serverFieldErrors, submitForm } from "@shop/app-kit/forms"
import {
    Dialog,
    DialogContent,
    FieldDescription,
    FieldTitle,
    applyServerFieldErrors,
    useAppForm,
    useFormErrorTranslator,
} from "@shop/ui-web"

import { CMS_NAV_KEYS, CMS_TITLE_MAX, cmsErr } from "../constants"
import { CmsFormBody, sortOrderField, targetField, targetTypeField } from "../form-dialog"
import { useT } from "#/locales/use-t"
import {
    NavFormSchema,
    navDefaults,
    normalizeSubs,
    SubsSchema,
    toNavRequest,
    type SubsValue,
} from "./form"
import { useCreateNav, useUpdateNav } from "./queries"
import { SubsEditor } from "./subs-editor"

export interface NavFormDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    // 传入 = 编辑，navKey 不可改；未传 = 新增
    editing?: NavEntryResponse
    defaultNavKey?: string
}

export function NavFormDialog({ open, onOpenChange, editing, defaultNavKey }: NavFormDialogProps) {
    return (
        <Dialog
            open={open}
            onOpenChange={onOpenChange}
        >
            <DialogContent className="flex max-h-dvh w-full flex-col gap-0 overflow-y-auto sm:max-w-2xl">
                <NavFormDialogBody
                    editing={editing}
                    defaultNavKey={defaultNavKey}
                    onOpenChange={onOpenChange}
                />
            </DialogContent>
        </Dialog>
    )
}

function NavFormDialogBody({
    editing,
    defaultNavKey,
    onOpenChange,
}: {
    editing?: NavEntryResponse
    defaultNavKey?: string
    onOpenChange: (open: boolean) => void
}) {
    const create = useCreateNav()
    const update = useUpdateNav()
    const busy = create.isPending || update.isPending
    const t = useT()

    const [subs, setSubs] = useState<SubsValue>(() => normalizeSubs(editing?.subs))
    // subs 是这份表单里唯一不走 field 的一块，自己过翻译器；存结构化事实才能在切语言时跟着变
    const [subsIssue, setSubsIssue] = useState<unknown>()
    const translateFieldError = useFormErrorTranslator()

    const form = useAppForm({
        defaultValues: navDefaults(editing, defaultNavKey),
        validators: { onSubmit: NavFormSchema },
        onSubmit: async ({ value }) => {
            const parsed = SubsSchema.safeParse(subs)
            if (!parsed.success) {
                setSubsIssue(parsed.error.issues[0] ?? cmsErr("cms.form.err.subsInvalid"))
                return
            }
            setSubsIssue(undefined)
            const input = toNavRequest(value, parsed.data)
            try {
                await (editing
                    ? update.mutateAsync({ id: editing.id, input })
                    : create.mutateAsync(input))
            } catch (error) {
                applyServerFieldErrors(
                    form,
                    serverFieldErrors(error, {
                        navKey: "navKey",
                        title: "title",
                        iconKey: "iconKey",
                        target: "target",
                        targetType: "targetType",
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
            title={editing ? t("cms.nav.form.editTitle") : t("cms.nav.form.createTitle")}
            busy={busy}
            onSubmit={() => submitForm(form)}
            onCancel={() => onOpenChange(false)}
        >
            <form.AppField name="navKey">
                {(field) => (
                    <field.TextField
                        label={t("cms.field.navKey")}
                        required
                        disabled={Boolean(editing)}
                        placeholder="home"
                        hint={t("cms.nav.form.navKeyHint", {
                            keys: CMS_NAV_KEYS.join("、"),
                        })}
                    />
                )}
            </form.AppField>
            <form.AppField name="sortOrder">{sortOrderField(t)}</form.AppField>
            <form.AppField name="title">
                {(field) => (
                    <field.TextField
                        label={t("cms.field.title")}
                        required
                        maxLength={CMS_TITLE_MAX}
                    />
                )}
            </form.AppField>
            <form.AppField name="iconKey">
                {(field) => (
                    <field.TextField
                        label={t("cms.nav.form.iconKeyLabel")}
                        placeholder={t("cms.nav.form.iconKeyPlaceholder")}
                        hint={t("cms.nav.form.iconKeyHint")}
                    />
                )}
            </form.AppField>

            <form.AppField name="targetType">{targetTypeField(t)}</form.AppField>
            <form.AppField name="target">{targetField(t)}</form.AppField>

            <div className="col-span-2 flex flex-col gap-2">
                {/* 不用 FieldContent：它带 flex-1，在纵向容器里会去抢空白 */}
                <div>
                    <FieldTitle>{t("cms.nav.form.subsTitle")}</FieldTitle>
                    <FieldDescription>{t("cms.nav.form.subsDesc")}</FieldDescription>
                </div>
                <SubsEditor
                    value={subs}
                    onChange={setSubs}
                    error={subsIssue === undefined ? undefined : translateFieldError(subsIssue)}
                />
            </div>
        </CmsFormBody>
    )
}
