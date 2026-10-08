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

import {
    countInputSchema,
    type SkuEditKind,
    type SkuTextRow,
    skuDisplayLabel,
    skuTextRowsForEdit,
    toSkuUpdateItemsFromText,
    yuanPriceSchema,
} from "#/product/draft-model"
import { useT } from "#/locales/use-t"
import { messageFactFactory } from "@shop/common/i18n"
import type { SellerMessageKey, SellerParamsByKey, SellerScopedT } from "#/locales/messages.gen"
import { SKU_CODE_MAX, SKU_EDIT_KIND_META } from "#/product/constants"
import { productDetailSuspenseOptions, useUpdateProductSkus } from "#/product/queries"

type ProductT = SellerScopedT<"product">

/**
 * 「编辑SKU / 编辑库存」弹窗：编辑商品每个 SKU 的某一维度（kind=price → 价格+商家编码；kind=stock → 库存）。
 *
 * - 从商品详情拉已有 SKU（含当前价格/编码/库存）逐行回填；
 * - 只改当前维度，另一个字段原样回传（updateSkus 把 price/stock 都视为必填绝对量，漏传会误重置）；
 * - 商家编码只有 price 模式可改，留空视为不改（后端 set 非空字段）；提交批量走 updateProductSkus。
 * - 生命周期：受控（open/productId 由外层持有）。保存成功后调用 onSaved 通知外层「列表数据变了」，
 *   由外层决定失效哪个 key —— 本层不 import 任何 query key。
 * - 详情到达后才挂载表单（默认值直接取详情，不需要 effect 二次灌值）；弹窗关闭即卸载。
 */

/** 校验消息只发结构化事实：这句话是「该去哪一列」的指引，
 *  通用 `validation.*` 说不清，所以进 seller catalog；`FieldError` 在渲染边界按当前语言换出来。 */
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

    // 取数交给弹窗体内的 QueryBoundary + SkuEditor（见下）：弹窗是列表页上的一个操作口，
    // 失败绝不能冒泡到路由把整张列表换掉；但**首次**取数失败必须让用户看见并能重试，
    // 所以用包在弹窗体内的区块边界，而不是「就地渲染 isError」也不是「静默降级」。
    // 详情与发布页回填同一份缓存（productKeys.detail），关着弹窗时根本不挂载子树 = 不发请求。
    return (
        <Dialog
            open={open}
            onOpenChange={onOpenChange}
        >
            {/* 必须用与基底相同的 sm: 修饰覆写 max-w —— twMerge 对不同修饰不合并，裸 max-w-3xl 会被 sm:max-w-sm 压掉导致内容溢出到半透明遮罩上。
                窄屏兜底 max-w-[calc(100%-2rem)] 由 ui-web 的 DialogContent 基底自带，这里不再重复 */}
            <DialogContent className="sm:max-w-3xl">
                <DialogHeader>
                    <DialogTitle>{t(meta.titleKey)}</DialogTitle>
                </DialogHeader>

                {/* 提示条：只改当前维度，另一维度去对应列。标题与关闭按钮不参与下面那个边界，
                    所以加载中/失败时用户仍能直接关窗 */}
                <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
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

/**
 * 弹窗体：详情到手后渲染表单。
 *
 * 用 suspense 而不是 `useQuery` + 往下传 isPending/isError/detail：那三个状态会让父组件
 * 变成「状态中转站」（类型谓词 `formReady` 就是被逼出来的产物），而 suspense 下
 * 「详情一定存在」由语言本身保证——挂到这里就意味着详情已到手。
 *
 * 另有一处语义差别值得留意：suspense 下**已有详情后的后台刷新失败不会卸载表单**——
 * 全局默认的 `throwOnError: throwWhenNoData` 在「有旧数据」时不抛，边界不接管，
 * 用户正在编辑的内容不会因为一次后台刷新失败而消失（旧 `isError` 优先的写法会）。
 */
function SkuEditor({
    kind,
    productId,
    productName,
    onOpenChange,
    onSaved,
}: {
    kind: SkuEditKind
    /** 由父组件的挂载条件保证存在：没有它就不会挂载本组件（也就不会发请求） */
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

/** 加载骨架：与表单同高，弹窗开合不跳 */
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

/**
 * 后端 `UpdateSkusRequest.items[i].*` → 本弹窗的 `rows[j].*`（数组路径的 422 落框映射）。
 *
 * 两边的下标**不同源**：`toSkuUpdateItemsFromText` 在库存模式会把未定价的行整条丢掉（价格是原样回传的
 * 绝对量，发 `null` 等于把那个 SKU 写成 0 元），于是 `items` 的下标是「投影之后的序号」而不是行号。
 * 这里用**同一个判据**重算一遍那条投影，得到「服务端第 k 项 = 表单第 j 行」——不重算就会把第 3 个 SKU
 * 的错标到第 3 行上，而第 3 行可能压根不是同一个规格（宁可不落红也别落错框）。
 *
 * 只列**本模式有输入框**的路径：库存模式能改的是库存，价格与商家编码都是原样回传的（没有框可标）。
 * 容器级的 `items`（`@NotEmpty`）也没有框——那张表由 SKU 列表生成，不是用户填的，落不进任何一格。
 */
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
        // 行内校验已在字段级通过；换算与「另一维原样回传」的投影规则在 draft-model
        onSubmit: async ({ value }) => {
            try {
                await save.mutateAsync({
                    productId,
                    items: toSkuUpdateItemsFromText(kind, value.rows),
                })
            } catch (error) {
                applyServerFieldErrors(
                    form,
                    // 显式类型形参：目标键是 `rows[3].priceText` 这种数组路径，不是 TForm 的键，
                    // 默认的 `Extract<keyof TForm, string>` 约束在这里只会挡住正确的写法
                    serverFieldErrors<Record<string, string>>(
                        error,
                        skuServerFieldMap(kind, value.rows),
                    ),
                )
                // 抛出去才让 form-core 把 isSubmitSuccessful 复位；接住它的是 submitForm
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

            {/* 超出视口高度内部滚动，避免整卡撑高；overflow-hidden 防止内容溢出到半透明遮罩 */}
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
