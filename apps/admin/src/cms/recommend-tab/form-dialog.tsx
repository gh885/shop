import type { RecommendTabResponse } from "@shop/api/sdk"

import { useQuery } from "@tanstack/react-query"
import { FormActions, serverFieldErrorTexts, submitForm } from "@shop/app-kit/forms"
import { useI18n } from "@shop/app-kit/i18n"
import {
    Dialog,
    DialogContent,
    DialogTitle,
    applyServerFieldErrors,
    useAppForm,
} from "@shop/ui-web"

import { CMS_TAB_NAME_MAX, CMS_TARGET_MAX, TARGET_TYPE_ITEMS } from "../constants"
import { tabDefaults, TabFormSchema, tabRowToRequest, toTabRequest } from "./form"
import { tabListOptions, useCreateTab, useUpdateTab } from "./queries"

export interface TabFormDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    /** 传入则为编辑；未传为新增 */
    editing?: RecommendTabResponse
}

/** 新增/编辑推荐词条。后端不管 isDefault 唯一性——勾选默认时由本页连带取消其他默认项。
    表单体挂在 DialogContent 里：BaseUI 关闭即卸载，每次打开重挂载让默认值从当前 editing 重算。 */
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
    const { locale } = useI18n()

    // 列表已由页面拉过，这里命中同一份缓存，只为算「其他默认项」
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
                // RecommendTabRequest 三个带注解的落点与表单字段同名：name（必填 + 词条名上限）、
                // target（定位值上限）、targetType（@Pattern）；isDefault / sortOrder 没有校验注解，不列
                applyServerFieldErrors(
                    form,
                    serverFieldErrorTexts(error, locale, {
                        name: "name",
                        target: "target",
                        targetType: "targetType",
                    }),
                )
                throw error
            }
            if (input.isDefault) {
                // 取消其他默认项是**别的行**的覆写：那一张表的字段级错误挂到这张表的框上是指认错
                // 对象，所以这一段不在上面的 try 里，失败只由 meta.error 那句 toast 交代
                const others = tabs.filter((t) => t.id !== editing?.id && t.isDefault)
                await Promise.all(
                    others.map((t) =>
                        update.mutateAsync({
                            id: t.id,
                            input: { ...tabRowToRequest(t), isDefault: false },
                        }),
                    ),
                )
            }
            onOpenChange(false)
        },
    })

    const otherDefaultCount = tabs.filter((t) => t.id !== editing?.id && t.isDefault).length

    return (
        <>
            <DialogTitle>{editing ? "编辑词条" : "新增词条"}</DialogTitle>

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
                            label="词条名"
                            required
                            placeholder="如「数码好物」"
                            maxLength={CMS_TAB_NAME_MAX}
                        />
                    )}
                </form.AppField>

                <div className="grid grid-cols-2 gap-4">
                    <form.AppField name="targetType">
                        {(field) => (
                            <field.SelectField
                                label="跳转类型"
                                items={TARGET_TYPE_ITEMS}
                            />
                        )}
                    </form.AppField>
                    <form.AppField name="target">
                        {(field) => (
                            <field.TextField
                                label="跳转目标"
                                placeholder="类目 ID 等（可选）"
                                maxLength={CMS_TARGET_MAX}
                            />
                        )}
                    </form.AppField>
                </div>

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

                <form.AppField name="isDefault">
                    {(field) => (
                        <field.CheckboxField
                            label="设为默认词条（猜你喜欢）"
                            hint={
                                otherDefaultCount > 0 && field.state.value
                                    ? `已有 ${otherDefaultCount} 个默认词条，保存后将同时取消它们的默认标记`
                                    : undefined
                            }
                        />
                    )}
                </form.AppField>

                <FormActions
                    pending={busy}
                    submitLabel="保存"
                    onCancel={() => onOpenChange(false)}
                />
            </form>
        </>
    )
}
