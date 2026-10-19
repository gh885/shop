import { PackageCheck } from "lucide-react"
import { useSuspenseQuery } from "@tanstack/react-query"

import { FormActions, serverFieldErrors, submitForm } from "@shop/app-kit/forms"
import { QueryBoundary } from "@shop/app-kit/data"
import type { ProductDetailResponse } from "@shop/api/sdk"
import {
    applyServerFieldErrors,
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    Field,
    FieldError,
    InputGroup,
    InputGroupAddon,
    InputGroupInput,
    Skeleton,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
    useAppForm,
} from "@shop/ui-web"

import { countInputSchema, yuanPriceSchema } from "#/product/form"
import { skuDisplayLabel } from "#/product/display"
import {
    type SkuEditKind,
    type SkuTextRow,
    skuTextRowsForEdit,
    toSkuUpdateItemsFromText,
} from "#/product/draft-rules"
import { useT } from "#/locales/use-t"
import { messageFactFactory } from "@shop/i18n"
import type { SellerMessageKey, SellerParamsByKey, SellerScopedT } from "#/locales/messages.gen"
import { SKU_CODE_MAX, SKU_EDIT_KIND_META } from "#/product/constants"
import { productDetailSuspenseOptions, useUpdateProductSkus } from "#/product/queries"

type ProductT = SellerScopedT<"product">

// updateSkus 把 price/stock 都视为必填绝对量：另一维必须原样回传，漏传=误重置
// 商家编码留空视为不改（后端 set 非空字段）；本层不 import query key，失效交外层 onSaved
type ProductErrKey = Extract<SellerMessageKey, `product.err.${string}`>
const err = messageFactFactory<ProductErrKey, SellerParamsByKey>()

export function EditSkuLineDialog({
    open,
    kind,
    productId,
    productName,
    onOpenChange,
    onSaved,
}: {
    open: boolean
    kind: SkuEditKind
    productId?: string
    productName?: string
    onOpenChange: (open: boolean) => void
    onSaved: () => void
}) {
    const t = useT()
    const meta = SKU_EDIT_KIND_META[kind]

    // 取数交给弹窗体内的 QueryBoundary：弹窗是列表页上的一个操作口，失败绝不能冒泡到路由把整张列表换掉；
    // 但首次取数失败必须可见可重试。关着弹窗不挂子树 = 不发请求
    return (
        <Dialog
            open={open}
            onOpenChange={onOpenChange}
        >
            {/* 必须用与基底相同的 sm: 修饰覆写 max-w：twMerge 对不同修饰不合并，裸 max-w-3xl 会被 sm:max-w-sm 压掉导致内容溢出到遮罩 */}
            <DialogContent className="sm:max-w-3xl">
                <DialogHeader>
                    <DialogTitle>{t(meta.titleKey)}</DialogTitle>
                </DialogHeader>

                {/* 标题与关闭按钮在下面的 QueryBoundary 之外：加载中/失败时用户仍能直接关窗 */}
                <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                    <PackageCheck className="size-4 shrink-0" />
                    {t(meta.noticeKey)}
                </div>

                {open && productId && (
                    <QueryBoundary
                        pending={<SkuDialogSkeleton />}
                        fallback={t("common.loadFailed.sku")}
                    >
                        <SkuEditor
                            kind={kind}
                            productId={productId}
                            productName={productName}
                            onOpenChange={onOpenChange}
                            onSaved={onSaved}
                        />
                    </QueryBoundary>
                )}
            </DialogContent>
        </Dialog>
    )
}

// 用 suspense 而非 useQuery 中转 isPending/isError/detail；throwWhenNoData 让已有详情后的后台刷新失败不卸载表单（旧 isError 优先写法会）
function SkuEditor({
    kind,
    productId,
    productName,
    onOpenChange,
    onSaved,
}: {
    kind: SkuEditKind
    productId: string
    productName: string | undefined
    onOpenChange: (open: boolean) => void
    onSaved: () => void
}) {
    const detail = useSuspenseQuery(productDetailSuspenseOptions(productId)).data

    return (
        <SkuLineForm
            kind={kind}
            productId={productId}
            productName={productName ?? detail.product.name}
            detail={detail}
            onOpenChange={onOpenChange}
            onSaved={onSaved}
        />
    )
}

function SkuDialogSkeleton() {
    return (
        <div className="flex max-h-dialog-body flex-col gap-2 overflow-hidden">
            <Skeleton className="h-9 w-full rounded-sm" />
            <Skeleton className="h-9 w-full rounded-sm" />
            <Skeleton className="h-9 w-full rounded-sm" />
            <Skeleton className="h-9 w-2/3 rounded-sm" />
        </div>
    )
}

// 后端报的是 items[k]（投影后的下标），不是行号：库存模式会丢掉未定价的行，k≠行号
// 这里用同一判据重算 rows[index]→items[itemIndex]，不重算会把第 3 个 SKU 的错标到第 3 行（落错框比不落框糟）
// 只列本模式有输入框的路径（库存模式的价格/编码、价格模式的库存都没有框可标）
export function skuServerFieldMap(
    kind: SkuEditKind,
    rows: readonly SkuTextRow[],
): Record<string, string> {
    const map: Record<string, string> = {}
    rows.map((row, index) => ({ row, index }))
        .filter(({ row }) => kind === "price" || row.price !== null)
        .forEach(({ index }, itemIndex) => {
            const item = `items[${itemIndex}]`
            const field = `rows[${index}]`
            if (kind === "price") {
                map[`${item}.price`] = `${field}.priceText`
                map[`${item}.price.amount`] = `${field}.priceText`
                map[`${item}.skuCode`] = `${field}.skuCodeText`
            } else {
                map[`${item}.stock`] = `${field}.stockText`
            }
        })
    return map
}

function SkuLineForm({
    kind,
    productId,
    productName,
    detail,
    onOpenChange,
    onSaved,
}: {
    kind: SkuEditKind
    productId: string
    productName: string
    detail: ProductDetailResponse
    onOpenChange: (open: boolean) => void
    onSaved: () => void
}) {
    const t = useT("product")
    const meta = SKU_EDIT_KIND_META[kind]
    const save = useUpdateProductSkus(meta.okMessage, () => {
        onSaved()
        onOpenChange(false)
    })

    const form = useAppForm({
        defaultValues: { rows: skuTextRowsForEdit(detail.skus) },
        onSubmit: async ({ value }) => {
            try {
                await save.mutateAsync({
                    productId,
                    items: toSkuUpdateItemsFromText(kind, value.rows),
                })
            } catch (error) {
                applyServerFieldErrors(
                    form,
                    // 显式类型形参：目标键是 rows[3].priceText 这种数组路径，默认的 Extract<keyof TForm, string> 会挡掉正确写法
                    serverFieldErrors<Record<string, string>>(
                        error,
                        skuServerFieldMap(kind, value.rows),
                    ),
                )
                // rethrow 才让 form-core 把 isSubmitSuccessful 复位；接住它的是 submitForm
                throw error
            }
        },
    })

    return (
        <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
                e.preventDefault()
                void submitForm(form)
            }}
        >
            <div className="text-sm">
                <span className="text-muted-foreground">{t("product.editSku.productLabel")}</span>
                <span className="font-medium">{productName}</span>
            </div>

            <div className="max-h-dialog-body overflow-y-auto overflow-x-hidden rounded-lg border border-border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="min-w-28">
                                {t("product.editSku.col.sku")}
                            </TableHead>
                            <TableHead>
                                {kind === "price"
                                    ? t("product.editSku.col.price")
                                    : t("product.editSku.col.stock")}
                            </TableHead>
                            {kind === "price" && (
                                <TableHead>{t("product.editSku.col.skuCode")}</TableHead>
                            )}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {form.state.values.rows.map((r, i) => (
                            <TableRow key={r.skuId}>
                                <TableCell
                                    variant="muted"
                                    className="whitespace-nowrap"
                                >
                                    {skuDisplayLabel(r.label, t)}
                                </TableCell>
                                <TableCell>
                                    {kind === "price" ? (
                                        <form.AppField
                                            name={`rows[${i}].priceText`}
                                            validators={{ onSubmit: yuanPriceSchema }}
                                        >
                                            {(field) => (
                                                <Field className="w-fit">
                                                    <InputGroup className="h-9">
                                                        <InputGroupInput
                                                            aria-label={t(
                                                                "product.editSku.price.aria",
                                                                {
                                                                    label: skuDisplayLabel(
                                                                        r.label,
                                                                        t,
                                                                    ),
                                                                },
                                                            )}
                                                            aria-invalid={!field.state.meta.isValid}
                                                            inputMode="decimal"
                                                            placeholder="0.00"
                                                            className="w-32 flex-none text-right tabular-nums"
                                                            value={field.state.value}
                                                            onChange={(e) =>
                                                                field.handleChange(e.target.value)
                                                            }
                                                        />
                                                        <InputGroupAddon
                                                            align="inline-end"
                                                            variant="quiet"
                                                        >
                                                            <SkuUnitYuan t={t} />
                                                        </InputGroupAddon>
                                                    </InputGroup>
                                                    <FieldError errors={field.state.meta.errors} />
                                                </Field>
                                            )}
                                        </form.AppField>
                                    ) : (
                                        <form.AppField
                                            name={`rows[${i}].stockText`}
                                            validators={{
                                                onSubmit: ({ value }) =>
                                                    // 库存模式回传的价格必须已设置：未定价的 SKU 先去价格列
                                                    r.price === null
                                                        ? err("product.err.priceFirst")
                                                        : countInputSchema.safeParse(value).error
                                                              ?.issues[0],
                                            }}
                                        >
                                            {(field) => (
                                                <Field className="w-fit">
                                                    <InputGroup className="h-9">
                                                        <InputGroupInput
                                                            aria-label={t(
                                                                "product.editSku.stock.aria",
                                                                {
                                                                    label: skuDisplayLabel(
                                                                        r.label,
                                                                        t,
                                                                    ),
                                                                },
                                                            )}
                                                            aria-invalid={!field.state.meta.isValid}
                                                            inputMode="numeric"
                                                            placeholder="0"
                                                            className="w-24 flex-none text-right tabular-nums"
                                                            value={field.state.value}
                                                            onChange={(e) =>
                                                                field.handleChange(
                                                                    e.target.value.replaceAll(
                                                                        /\D/g,
                                                                        "",
                                                                    ),
                                                                )
                                                            }
                                                        />
                                                        <InputGroupAddon
                                                            align="inline-end"
                                                            variant="quiet"
                                                        >
                                                            <SkuUnitPiece t={t} />
                                                        </InputGroupAddon>
                                                    </InputGroup>
                                                    <FieldError errors={field.state.meta.errors} />
                                                </Field>
                                            )}
                                        </form.AppField>
                                    )}
                                </TableCell>
                                {kind === "price" && (
                                    <TableCell>
                                        <form.AppField name={`rows[${i}].skuCodeText`}>
                                            {(field) => (
                                                <field.TextField
                                                    aria-label={t("product.editSku.skuCode.aria", {
                                                        label: skuDisplayLabel(r.label, t),
                                                    })}
                                                    maxLength={SKU_CODE_MAX}
                                                    className="w-48"
                                                    placeholder={t(
                                                        "product.editSku.skuCode.placeholder",
                                                        { max: SKU_CODE_MAX },
                                                    )}
                                                />
                                            )}
                                        </form.AppField>
                                    </TableCell>
                                )}
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>

            <FormActions
                pending={save.isPending}
                disableCancel={save.isPending}
                submitLabel={t("product.editSku.submit")}
                onCancel={() => onOpenChange(false)}
            />
        </form>
    )
}

function SkuUnitYuan({ t }: { t: ProductT }) {
    return <>{t("product.sku.unit.yuan")}</>
}
function SkuUnitPiece({ t }: { t: ProductT }) {
    return <>{t("product.sku.unit.piece")}</>
}
