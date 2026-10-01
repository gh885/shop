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
} from "@shop/common"
import { FormActions, serverFieldErrorTexts, submitForm, useI18n } from "@shop/app-kit"
import {
    applyServerFieldErrors,
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    useAppForm,
} from "@shop/ui-web"

import type { ProductTitleTarget } from "./table"

/** 两个字段的规则是 owner 的（`@shop/common/product-fields` ↔ Java `ProductFieldRules`），这里只组形状 */
const TitleSchema = z.object({
    name: ProductNameSchema,
    subtitle: SellPointSchema,
})

/**
 * 编辑标题 弹窗：改「商品标题 + 导购标题（卖点）」两项。
 *
 * - 数据直接来自列表行（列表行已含 name/subtitle），无需再拉详情；
 * - 提交走 updateProduct（PATCH：传空串 subtitle 即「清空卖点」，name 必填）。
 * - 生命周期：受控（open/product 由外层持有）。保存成功后调用 onSaved 通知外层「列表数据变了」，
 *   由外层（useProductList 的 handleSaved）决定失效哪个 key —— 本层不 import 任何 query key。
 * - props 只收预填切片（id/name/subtitle），不背整行商品。
 * - 表单体挂在 DialogContent 里：BaseUI 关闭即卸载，打开即按当前行预填。
 */
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
    const { locale } = useI18n()
    // 写通道走库 useMutation：反馈（成功/失败 toast）由全局 MutationCache 按 meta 执行，
    // 失效范围仍由外层决定（onSaved），本层不 import query key。
    const save = useMutation({
        mutationFn: (body: { name: string; subtitle: string }) =>
            ProductsAdminApi.updateProduct({ path: { id: product.id }, body }),
        meta: { success: "标题已更新", error: "保存失败" },
        onSuccess: () => onSaved(),
    })

    const form = useAppForm({
        // subtitle 为 null 视作空卖点
        defaultValues: { name: product.name, subtitle: product.subtitle ?? "" },
        validators: { onSubmit: TitleSchema },
        onSubmit: async ({ value }) => {
            // DTO UpdateProductRequest 其余字段（categoryId/detailImages/mainImage/images/params/
            // sevenDayReturn）本表单没有对应输入框，不进 map；name(@Size)/subtitle(@Pattern) 同名有框。
            try {
                await save.mutateAsync({ name: value.name.trim(), subtitle: value.subtitle.trim() })
            } catch (error) {
                applyServerFieldErrors(
                    form,
                    serverFieldErrorTexts(error, locale, {
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
                <DialogTitle>编辑标题</DialogTitle>
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
                            label="商品标题"
                            required
                            counter
                            maxLength={PRODUCT_NAME_MAX}
                            placeholder="请输入商品标题"
                            className="tabular-nums"
                        />
                    )}
                </form.AppField>

                <form.AppField name="subtitle">
                    {(field) => (
                        <field.TextField
                            label="导购标题"
                            counter
                            maxLength={SELL_POINT_MAX}
                            placeholder={`选填，${SELL_POINT_MIN}~${SELL_POINT_MAX} 字，留空即不展示卖点`}
                            hint={
                                <>
                                    <Lightbulb className="mr-1 inline size-3.5 text-warning" />
                                    标题结构推荐：品牌 + 品类词 + 利益点
                                </>
                            }
                        />
                    )}
                </form.AppField>

                <FormActions
                    pending={save.isPending}
                    disableCancel={save.isPending}
                    submitLabel="提交"
                    onCancel={() => onOpenChange(false)}
                />
            </form>
        </>
    )
}
