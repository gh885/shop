import type { ReactNode } from "react"

import { Button, DialogFooter, DialogTitle, Spinner, type useAppForm } from "@shop/ui-web"
import { localizeStatusOptions } from "@shop/app-kit/i18n"

import type { AdminTranslate } from "#/locales/messages.gen"
import { CMS_TARGET_MAX, TARGET_TYPE_ITEMS } from "./constants"

/** banner / 导航两张弹窗表单的表单体：标题 + 两列网格 + 取消/保存页脚（字段由调用点给） */
export function CmsFormBody({
    title,
    busy,
    onSubmit,
    onCancel,
    children,
}: {
    title: string
    busy: boolean
    onSubmit: () => Promise<unknown>
    onCancel: () => void
    children: ReactNode
}) {
    return (
        <>
            <DialogTitle>{title}</DialogTitle>

            <form
                className="mt-4 grid grid-cols-2 gap-x-4 gap-y-5"
                onSubmit={(e) => {
                    e.preventDefault()
                    void onSubmit()
                }}
            >
                {children}

                <DialogFooter className="col-span-2">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={onCancel}
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

/** AppField 渲染函数拿到的 field：只取用得到的两个字段组件，两张表单的数据形状不同也能共用 */
type CmsField = Pick<
    Parameters<Parameters<ReturnType<typeof useAppForm>["AppField"]>[0]["children"]>[0],
    "TextField" | "SelectField"
>

/** 「跳转 + 排序」三格的字段渲染（对应 CmsTargetSortSchema），
    当 AppField 的 children 用：`<form.AppField name="target">{targetField}</form.AppField>` */
export const sortOrderField = (field: CmsField) => (
    <field.TextField
        label="排序值"
        placeholder="0"
        inputMode="numeric"
        hint="越小越靠前"
    />
)

export const targetTypeField = (t: AdminTranslate) => (field: CmsField) => (
    <field.SelectField
        label="跳转类型"
        items={localizeStatusOptions(TARGET_TYPE_ITEMS, t)}
    />
)

export const targetField = (field: CmsField) => (
    <field.TextField
        label="跳转目标"
        placeholder="商品/类目 ID、活动名或搜索词"
        maxLength={CMS_TARGET_MAX}
    />
)
