import { useState } from "react"
import type { NavEntryResponse } from "@shop/api/sdk"

import { serverFieldErrorTexts, submitForm } from "@shop/app-kit/forms"
import { useI18n } from "@shop/app-kit/i18n"
import {
    Dialog,
    DialogContent,
    FieldDescription,
    FieldTitle,
    applyServerFieldErrors,
    useAppForm,
} from "@shop/ui-web"

import { CMS_NAV_KEYS, CMS_TITLE_MAX } from "../constants"
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
    /** 传入则为编辑（navKey 不可改）；未传为新增 */
    editing?: NavEntryResponse
    /** 新增时预填当前筛选的导航位 */
    defaultNavKey?: string
}

/** 新增/编辑导航条目：标量走 useAppForm，subs 整段 JSONB 由 SubsEditor 独立受控。
    壳只持有 Dialog 开合；表单体挂在 DialogContent 里——BaseUI 关闭即卸载，
    每次打开重挂载让 subs / 表单默认值从当前 editing 重算，无需 effect 手动重置。 */
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
    const { locale } = useI18n()
    const t = useT()

    const [subs, setSubs] = useState<SubsValue>(() => normalizeSubs(editing?.subs))
    const [subsError, setSubsError] = useState<string>()

    const form = useAppForm({
        defaultValues: navDefaults(editing, defaultNavKey),
        validators: { onSubmit: NavFormSchema },
        onSubmit: async ({ value }) => {
            const parsed = SubsSchema.safeParse(subs)
            if (!parsed.success) {
                setSubsError(parsed.error.issues[0]?.message ?? "分组配置不合法")
                return
            }
            setSubsError(undefined)
            const input = toNavRequest(value, parsed.data)
            try {
                await (editing
                    ? update.mutateAsync({ id: editing.id, input })
                    : create.mutateAsync(input))
            } catch (error) {
                // NavRequest 里能落进这张表单的六个组件名全部同名（navKey/iconKey 的 KEY_MAX、
                // title 的 TITLE_MAX、target 的 TARGET_MAX、targetType 的 @Pattern、sortOrder 的整数）。
                // subs 是 SubsEditor 那份独立受控状态、不在 form 里：后端关于 subs 的字段级明细
                // （分组数上限、组名长度）落不到 form 的任何一个框上，宁可少落也不塞进某个全局格子——
                // 它由 meta.error 那句 toast 兜住
                applyServerFieldErrors(
                    form,
                    serverFieldErrorTexts(error, locale, {
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
            title={editing ? "编辑导航条目" : "新增导航条目"}
            busy={busy}
            onSubmit={() => submitForm(form)}
            onCancel={() => onOpenChange(false)}
        >
            <form.AppField name="navKey">
                {(field) => (
                    <field.TextField
                        label="导航位"
                        required
                        disabled={Boolean(editing)}
                        placeholder="home"
                        hint={`前台已消费：${CMS_NAV_KEYS.join("、")}`}
                    />
                )}
            </form.AppField>
            <form.AppField name="sortOrder">{sortOrderField}</form.AppField>
            <form.AppField name="title">
                {(field) => (
                    <field.TextField
                        label="标题"
                        required
                        maxLength={CMS_TITLE_MAX}
                    />
                )}
            </form.AppField>
            <form.AppField name="iconKey">
                {(field) => (
                    <field.TextField
                        label="图标 Key"
                        placeholder="如 smartphone"
                        hint="lucide 图标名，前台按映射渲染"
                    />
                )}
            </form.AppField>

            <form.AppField name="targetType">{targetTypeField(t)}</form.AppField>
            <form.AppField name="target">{targetField}</form.AppField>

            <div className="col-span-2 flex flex-col gap-2">
                {/* 不用 FieldContent：它带 flex-1，在纵向容器里会去抢空白 */}
                <div>
                    <FieldTitle>分组与词条</FieldTitle>
                    <FieldDescription>
                        mega 面板内容：每个分组含名称与词条列表，词条留空提交时自动剔除
                    </FieldDescription>
                </div>
                <SubsEditor
                    value={subs}
                    onChange={setSubs}
                    error={subsError}
                />
            </div>
        </CmsFormBody>
    )
}
