import { message } from "#/locales/message"
import { Lightbulb } from "lucide-react"
import { useMutation } from "@tanstack/react-query"
import { z } from "zod"

import { ProductsAdminApi } from "@shop/api/sdk"
import {
    PRODUCT_NAME_MAX,
    ProductNameSchema,
    SELL_POINT_MAX,
    SELL_POINT_MIN,
    SellPointSchema,
} from "@shop/common/domain"
import { FormActions, serverFieldErrors, submitForm } from "@shop/app-kit/forms"
import {
    applyServerFieldErrors,
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    useAppForm,
} from "@shop/ui-web"

import { useT } from "#/locales/use-t"

import type { ProductTitleTarget } from "./table"

// 规则是 owner 的（@shop/common/domain ↔ Java ProductFieldRules），这里只组形状，不重声明长度/正则
const TitleSchema = z.object({
    name: ProductNameSchema,
    subtitle: SellPointSchema,
})

// 保存成功后失效交外层 onSaved：本组件不 import query key
export function EditTitleDialog({
    open,
    product,
    onOpenChange,
    onSaved,
}: {
    open: boolean
    product?: ProductTitleTarget
    onOpenChange: (open: boolean) => void
    onSaved: () => void
}) {
    return (
        <Dialog
            open={open}
            onOpenChange={onOpenChange}
        >
            <DialogContent className="sm:max-w-2xl">
                {product && (
                    <TitleForm
                        product={product}
                        onOpenChange={onOpenChange}
                        onSaved={onSaved}
                    />
                )}
            </DialogContent>
        </Dialog>
    )
}

function TitleForm({
    product,
    onOpenChange,
    onSaved,
}: {
    product: ProductTitleTarget
    onOpenChange: (open: boolean) => void
    onSaved: () => void
}) {
    const t = useT("product")
    const save = useMutation({
        mutationFn: (body: { name: string; subtitle: string }) =>
            ProductsAdminApi.updateProduct({ path: { id: product.id }, body }),
        meta: {
            success: message("product.toast.titleUpdated"),
            error: message("product.toast.saveFailed"),
        },
        onSuccess: () => onSaved(),
    })

    const form = useAppForm({
        defaultValues: { name: product.name, subtitle: product.subtitle ?? "" },
        validators: { onSubmit: TitleSchema },
        onSubmit: async ({ value }) => {
            try {
                await save.mutateAsync({ name: value.name.trim(), subtitle: value.subtitle.trim() })
            } catch (error) {
                applyServerFieldErrors(
                    form,
                    serverFieldErrors(error, {
                        name: "name",
                        subtitle: "subtitle",
                    }),
                )
                throw error
            }
            onOpenChange(false)
        },
    })

    return (
        <>
            <DialogHeader>
                <DialogTitle>{t("product.editTitle.title")}</DialogTitle>
            </DialogHeader>

            <form
                className="flex flex-col gap-5"
                onSubmit={(e) => {
                    e.preventDefault()
                    void submitForm(form)
                }}
            >
                <form.AppField name="name">
                    {(field) => (
                        <field.TextField
                            label={t("product.editTitle.name.label")}
                            required
                            counter
                            maxLength={PRODUCT_NAME_MAX}
                            placeholder={t("product.editTitle.name.placeholder")}
                            className="tabular-nums"
                        />
                    )}
                </form.AppField>

                <form.AppField name="subtitle">
                    {(field) => (
                        <field.TextField
                            label={t("product.editTitle.subtitle.label")}
                            counter
                            maxLength={SELL_POINT_MAX}
                            placeholder={t("product.editTitle.subtitle.placeholder", {
                                min: SELL_POINT_MIN,
                                max: SELL_POINT_MAX,
                            })}
                            hint={
                                <>
                                    <Lightbulb className="mr-1 inline size-3.5 text-warning" />
                                    {t("product.editTitle.subtitle.hint")}
                                </>
                            }
                        />
                    )}
                </form.AppField>

                <FormActions
                    pending={save.isPending}
                    disableCancel={save.isPending}
                    submitLabel={t("product.editTitle.submit")}
                    onCancel={() => onOpenChange(false)}
                />
            </form>
        </>
    )
}
