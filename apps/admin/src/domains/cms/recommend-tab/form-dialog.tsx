import type { RecommendTabResponse } from "@shop/api/sdk"

import { useQuery } from "@tanstack/react-query"
import { FormActions, serverFieldErrors, submitForm } from "@shop/app-kit/forms"
import { localizeStatusOptions } from "@shop/app-kit/i18n"
import {
    Dialog,
    DialogContent,
    DialogTitle,
    applyServerFieldErrors,
    useAppForm,
} from "@shop/ui-web"

import { useT } from "#/locales/use-t"
import { CMS_TAB_NAME_MAX, CMS_TARGET_MAX, TARGET_TYPE_ITEMS } from "../constants"
import { tabDefaults, TabFormSchema, tabRowToRequest, toTabRequest } from "./form"
import { tabListOptions, useCreateTab, useUpdateTab } from "./queries"

export interface TabFormDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    editing?: RecommendTabResponse
}

export function TabFormDialog({ open, onOpenChange, editing }: TabFormDialogProps) {
    return (
        <Dialog
            open={open}
            onOpenChange={onOpenChange}
        >
            <DialogContent className="sm:max-w-lg">
                <TabForm
                    editing={editing}
                    onOpenChange={onOpenChange}
                />
            </DialogContent>
        </Dialog>
    )
}

function TabForm({ editing, onOpenChange }: Omit<TabFormDialogProps, "open">) {
    const create = useCreateTab()
    const update = useUpdateTab()
    const busy = create.isPending || update.isPending
    const t = useT()

    const { data: tabs = [] } = useQuery(tabListOptions())

    const form = useAppForm({
        defaultValues: tabDefaults(editing),
        validators: { onSubmit: TabFormSchema },
        onSubmit: async ({ value }) => {
            const input = toTabRequest(value)
            try {
                if (editing) {
                    await update.mutateAsync({ id: editing.id, input })
                } else {
                    await create.mutateAsync(input)
                }
            } catch (error) {
                applyServerFieldErrors(
                    form,
                    serverFieldErrors(error, {
                        name: "name",
                        target: "target",
                        targetType: "targetType",
                    }),
                )
                throw error
            }
            if (input.isDefault) {
                // 取消其他默认项是别的行的覆写：那一张表的字段级错误挂到这张表=认错对象，故不在上面的 try 里，失败只由 toast 交代
                const others = tabs.filter((tab) => tab.id !== editing?.id && tab.isDefault)
                await Promise.all(
                    others.map((tab) =>
                        update.mutateAsync({
                            id: tab.id,
                            input: { ...tabRowToRequest(tab), isDefault: false },
                        }),
                    ),
                )
            }
            onOpenChange(false)
        },
    })

    const otherDefaultCount = tabs.filter((tab) => tab.id !== editing?.id && tab.isDefault).length

    return (
        <>
            <DialogTitle>
                {editing ? t("cms.tab.form.editTitle") : t("cms.tab.form.createTitle")}
            </DialogTitle>

            <form
                className="mt-4 flex flex-col gap-5"
                onSubmit={(e) => {
                    e.preventDefault()
                    void submitForm(form)
                }}
            >
                <form.AppField name="name">
                    {(field) => (
                        <field.TextField
                            label={t("cms.field.tabName")}
                            required
                            placeholder={t("cms.tab.form.namePlaceholder")}
                            maxLength={CMS_TAB_NAME_MAX}
                        />
                    )}
                </form.AppField>

                <div className="grid grid-cols-2 gap-4">
                    <form.AppField name="targetType">
                        {(field) => (
                            <field.SelectField
                                label={t("cms.form.targetType")}
                                items={localizeStatusOptions(TARGET_TYPE_ITEMS, t)}
                            />
                        )}
                    </form.AppField>
                    <form.AppField name="target">
                        {(field) => (
                            <field.TextField
                                label={t("cms.form.target")}
                                placeholder={t("cms.tab.form.targetPlaceholder")}
                                maxLength={CMS_TARGET_MAX}
                            />
                        )}
                    </form.AppField>
                </div>

                <form.AppField name="sortOrder">
                    {(field) => (
                        <field.TextField
                            label={t("cms.form.sortOrder")}
                            placeholder="0"
                            inputMode="numeric"
                            hint={t("cms.form.sortOrderHint")}
                        />
                    )}
                </form.AppField>

                <form.AppField name="isDefault">
                    {(field) => (
                        <field.CheckboxField
                            label={t("cms.tab.form.isDefaultLabel")}
                            hint={
                                otherDefaultCount > 0 && field.state.value
                                    ? t("cms.tab.form.defaultHint", {
                                          count: otherDefaultCount,
                                      })
                                    : undefined
                            }
                        />
                    )}
                </form.AppField>

                <FormActions
                    pending={busy}
                    submitLabel={t("cms.form.save")}
                    onCancel={() => onOpenChange(false)}
                />
            </form>
        </>
    )
}
