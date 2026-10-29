import { message } from "#/locales/message"
import { useMutation, useQuery } from "@tanstack/react-query"
import { SellerProductEditControllerApi } from "@shop/api/sdk"
import { PRODUCT_NAME_MAX, ProductNameSchema } from "@shop/common/domain"
import { z } from "zod"
import { FormActions, serverFieldErrors, submitForm } from "@shop/app-kit/forms"
import {
    applyServerFieldErrors,
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    Skeleton,
    useAppForm,
} from "@shop/ui-web"

import { useT } from "#/locales/use-t"
import { productDetailSuspenseOptions } from "#/domains/product/queries"
import type { ProductLineTarget } from "./table"

// 规则是 owner 的（@shop/common/domain ↔ Java ProductFieldRules），这里只组形状
const TitleSchema = z.object({
    name: ProductNameSchema,
})

// 保存成功后失效交外层 onSaved：本组件不 import query key
export function EditTitleDialog({
    open,
    product,
    onOpenChange,
    onSaved,
}: {
    open: boolean
    product?: ProductLineTarget
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
                        key={product.spuId}
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
    product: ProductLineTarget
    onOpenChange: (open: boolean) => void
    onSaved: () => void
}) {
    const t = useT("product")
    const detail = useQuery(productDetailSuspenseOptions(product.spuId))

    const save = useMutation({
        mutationFn: (body: { title: string }) =>
            SellerProductEditControllerApi.updateBasics({
                path: { spuId: product.spuId },
                // 改基本信息是全量替换：品牌/型号/属性/图片必须原样回传，漏了就等于清空
                body: {
                    title: body.title,
                    brandId: detail.data?.brandId,
                    modelNo: detail.data?.modelNo,
                    attributes: detail.data?.attributes?.map((a) => ({
                        attributeId: a.attributeId,
                        value: a.value,
                    })),
                    images: detail.data?.images,
                },
            }),
        meta: {
            success: message("product.toast.titleUpdated"),
            error: message("product.toast.saveFailed"),
        },
        onSuccess: () => onSaved(),
    })

    const form = useAppForm({
        defaultValues: { name: product.title },
        validators: { onSubmit: TitleSchema },
        onSubmit: async ({ value }) => {
            try {
                await save.mutateAsync({ title: value.name.trim() })
            } catch (error) {
                applyServerFieldErrors(form, serverFieldErrors(error, { name: "title" }))
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

            {detail.isPending ? (
                <Skeleton className="h-9 w-full rounded-sm" />
            ) : (
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

                    <FormActions
                        pending={save.isPending}
                        disableCancel={save.isPending}
                        submitLabel={t("product.editTitle.submit")}
                        onCancel={() => onOpenChange(false)}
                    />
                </form>
            )}
        </>
    )
}
