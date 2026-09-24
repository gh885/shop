import { useState } from "react"
import type { NavEntryResponse } from "@shop/api/sdk"

import {
    Button,
    Dialog,
    DialogContent,
    DialogFooter,
    DialogTitle,
    FieldDescription,
    FieldTitle,
    Spinner,
    useAppForm,
} from "@shop/ui-web"

import { CMS_NAV_KEYS, CMS_TARGET_MAX, CMS_TITLE_MAX, TARGET_TYPE_ITEMS } from "../constants"
import { NavFormSchema, navDefaults, SubsSchema, toNavRequest, type SubsValue } from "./form"
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
            if (editing) {
                await update.mutateAsync({ id: editing.id, input })
            } else {
                await create.mutateAsync(input)
            }
            onOpenChange(false)
        },
    })

    return (
        <>
            <DialogTitle>{editing ? "编辑导航条目" : "新增导航条目"}</DialogTitle>

            <form
                className="mt-4 grid grid-cols-2 gap-x-4 gap-y-5"
                onSubmit={(e) => {
                    e.preventDefault()
                    void form.handleSubmit()
                }}
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
                            placeholder="商品/类目 ID、活动名或搜索词"
                            maxLength={CMS_TARGET_MAX}
                        />
                    )}
                </form.AppField>

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

                <DialogFooter className="col-span-2">
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
                        {busy && <Spinner />}保存
                    </Button>
                </DialogFooter>
            </form>
        </>
    )
}

const normalizeSubs = (subs?: NavEntryResponse["subs"]): SubsValue =>
    (subs ?? []).map((g) => ({ name: g.name, items: g.items ?? [] }))
