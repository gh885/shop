import { useEffect } from "react"
import type { RecommendTabResponse } from "@shop/api/sdk"

import { useQuery } from "@tanstack/react-query"
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
import { tabDefaults, TabFormSchema, tabRowToRequest, toTabRequest } from "./form"
import { tabListOptions, useCreateTab, useUpdateTab } from "./queries"

export interface TabFormDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    /** 传入则为编辑；未传为新增 */
    editing?: RecommendTabResponse
}

/** 新增/编辑推荐词条。后端不管 isDefault 唯一性——勾选默认时由本页连带取消其他默认项 */
export function TabFormDialog({ open, onOpenChange, editing }: TabFormDialogProps) {
    const create = useCreateTab()
    const update = useUpdateTab()
    const busy = create.isPending || update.isPending

    // 列表已由页面拉过，这里命中同一份缓存，只为算「其他默认项」
    const { data: tabs = [] } = useQuery(tabListOptions())

    const form = useAppForm({
        defaultValues: tabDefaults(editing),
        validators: { onSubmit: TabFormSchema },
        onSubmit: async ({ value }) => {
            const input = toTabRequest(value)
            if (editing) {
                await update.mutateAsync({ id: editing.id, input })
            } else {
                await create.mutateAsync(input)
            }
            if (input.isDefault) {
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

    useEffect(() => {
        if (open) form.reset(tabDefaults(editing))
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, editing])

    const otherDefaultCount = tabs.filter((t) => t.id !== editing?.id && t.isDefault).length

    return (
        <Dialog
            open={open}
            onOpenChange={onOpenChange}
        >
            <DialogContent className="sm:max-w-lg">
                <DialogTitle>{editing ? "编辑词条" : "新增词条"}</DialogTitle>

                <form
                    className="mt-4 flex flex-col gap-5"
                    onSubmit={(e) => {
                        e.preventDefault()
                        void form.handleSubmit()
                    }}
                >
                    <form.AppField name="name">
                        {(field) => (
                            <field.TextField
                                label="词条名"
                                required
                                placeholder="如「数码好物」"
                                maxLength={32}
                            />
                        )}
                    </form.AppField>

                    <div className="grid grid-cols-2 gap-4">
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
                                    placeholder="类目 ID 等（可选）"
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

                    <div className="flex flex-col gap-1.5">
                        <form.AppField name="isDefault">
                            {(field) => <field.CheckboxField label="设为默认词条（猜你喜欢）" />}
                        </form.AppField>
                        {otherDefaultCount > 0 && (
                            <form.Subscribe selector={(state) => state.values.isDefault}>
                                {(isDefault) =>
                                    isDefault ? (
                                        <p className="text-xs text-warning-subtle-foreground">
                                            已有 {otherDefaultCount}{" "}
                                            个默认词条，保存后将同时取消它们的默认标记
                                        </p>
                                    ) : undefined
                                }
                            </form.Subscribe>
                        )}
                    </div>

                    <div className="mt-2 flex justify-end gap-2">
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
