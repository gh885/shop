import type { ReactNode } from "react"

import { Button, DialogFooter, DialogTitle, Spinner, type useAppForm } from "@shop/ui-web"
import { localizeStatusOptions } from "@shop/app-kit/i18n"

import type { AdminTranslate } from "#/locales/messages.gen"
import { useT } from "#/locales/use-t"
import { CMS_TARGET_MAX, TARGET_TYPE_ITEMS } from "./constants"

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
    const t = useT()
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
                        {t("common.action.cancel")}
                    </Button>
                    <Button
                        type="submit"
                        disabled={busy}
                    >
                        {busy && <Spinner />}
                        {t("cms.form.save")}
                    </Button>
                </DialogFooter>
            </form>
        </>
    )
}

type CmsField = Pick<
    Parameters<Parameters<ReturnType<typeof useAppForm>["AppField"]>[0]["children"]>[0],
    "TextField" | "SelectField"
>

export const sortOrderField = (t: AdminTranslate) => (field: CmsField) => (
    <field.TextField
        label={t("cms.form.sortOrder")}
        placeholder="0"
        inputMode="numeric"
        hint={t("cms.form.sortOrderHint")}
    />
)

export const targetTypeField = (t: AdminTranslate) => (field: CmsField) => (
    <field.SelectField
        label={t("cms.form.targetType")}
        items={localizeStatusOptions(TARGET_TYPE_ITEMS, t)}
    />
)

export const targetField = (t: AdminTranslate) => (field: CmsField) => (
    <field.TextField
        label={t("cms.form.target")}
        placeholder={t("cms.form.targetPlaceholder")}
        maxLength={CMS_TARGET_MAX}
    />
)
