import { PackageCheck } from "lucide-react"
import { useQuery } from "@tanstack/react-query"

import { toApiError } from "@shop/common"
import { errorText, FormActions, useI18n } from "@shop/app-kit"
import type { ProductDetailResponse } from "@shop/api/sdk"
import {
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
    StateError,
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
    skuTextRowsForEdit,
    toSkuUpdateItemsFromText,
    yuanPriceSchema,
} from "#/product/draft-model"
import { useT } from "#/locales/use-t"
import { SKU_CODE_MAX, SKU_EDIT_KIND_META } from "#/product/constants"
import { productDetailOptions, useUpdateProductSkus } from "#/product/queries"

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
    const meta = SKU_EDIT_KIND_META[kind]

    // 详情走 query：与发布页回填同一份缓存（productKeys.detail）。
    // 关着弹窗、或没有 productId 时 skipToken 直接不发请求；打开即命中缓存（若发布页刚填过则零请求）。
    // 失败**不抛**（弹窗是列表页上的一个操作口，炸到路由会把整张列表换掉）：就地渲染错误态并用官方
    // `refetch()` 重试。变量名用 data 而非 detail：下面对它做 undefined 判定（渲染 loading 分支）时，
    // tsgolint 只认 `data === undefined` 这种能收窄 UseQueryResult 的写法
    const { data, isPending, isError, error, isFetching, refetch } = useQuery(
        productDetailOptions(open ? productId : undefined),
    )

    return (
        <Dialog
            open={open}
            onOpenChange={onOpenChange}
        >
            {/* 必须用与基底相同的 sm: 修饰覆写 max-w —— twMerge 对不同修饰不合并，裸 max-w-3xl 会被 sm:max-w-sm 压掉导致内容溢出到半透明遮罩上。
                窄屏兜底 max-w-[calc(100%-2rem)] 由 ui-web 的 DialogContent 基底自带，这里不再重复 */}
            <DialogContent className="sm:max-w-3xl">
                <DialogHeader>
                    <DialogTitle>{meta.title}</DialogTitle>
                </DialogHeader>

                {/* 提示条：只改当前维度，另一维度去对应列 */}
                <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                    <PackageCheck className="size-4 shrink-0" />
                    {meta.notice}
                </div>

                <SkuDialogBody
                    kind={kind}
                    productId={productId}
                    productName={productName}
                    detail={data}
                    isPending={isPending}
                    isError={isError}
                    error={error}
                    isFetching={isFetching}
                    refetch={refetch}
                    onOpenChange={onOpenChange}
                    onSaved={onSaved}
                />
            </DialogContent>
        </Dialog>
    )
}

/**
 * 弹窗体：错误 / 骨架 / 表单 三态。抽出来是为了让 EditSkuLineDialog 只剩「标题 + 提示条 + 本组件」
 * 三件事（健康扫描按「cc>=5 且零覆盖必上榜」判，三态的全塞在一个函数里会到 cc 6）。
 */
/** 三态判定：能渲染表单吗。三个条件收在这一处（`&&` 链留在小函数里，主函数就只剩两个 if） */
type SkuFormState = {
    isPending: boolean
    productId: string | undefined
    detail: ProductDetailResponse | undefined
}

/** 取数是否就绪：pending / 没有 productId / 没有 detail 任一成立就还渲染骨架 */
function formReady(
    s: SkuFormState,
): s is { isPending: false; productId: string; detail: ProductDetailResponse } {
    return !s.isPending && s.productId !== undefined && s.detail !== undefined
}

function SkuDialogBody({
    kind,
    productId,
    productName,
    detail,
    isPending,
    isError,
    error,
    isFetching,
    refetch,
    onOpenChange,
    onSaved,
}: {
    kind: SkuEditKind
    productId?: string
    productName?: string
    detail: ProductDetailResponse | undefined
    isPending: boolean
    isError: boolean
    error: unknown
    isFetching: boolean
    refetch: () => void
    onOpenChange: (open: boolean) => void
    onSaved: () => void
}) {
    const { locale } = useI18n()
    const t = useT()
    if (isError) {
        return (
            <StateError
                message={errorText(toApiError(error), locale, t("common.loadFailed.sku"))}
                onRetry={() => refetch()}
                retrying={isFetching}
            />
        )
    }
    // 取数三态收成一个 state 对象 + 类型谓词：谓词一次把 productId/detail 一起收窄
    // （单个值的谓词管不到另一个，省不掉断言），而 `||` 链全在谓词函数里，
    // 主函数只剩两个 if —— 健康扫描按「cc>=5 且零覆盖必上榜」判
    const state = { isPending, productId, detail }
    if (!formReady(state)) return <SkuDialogSkeleton />
    return (
        <SkuLineForm
            kind={kind}
            productId={state.productId}
            productName={productName ?? state.detail.product.name}
            detail={state.detail}
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
    const meta = SKU_EDIT_KIND_META[kind]
    const save = useUpdateProductSkus(meta.okMessage, () => {
        onSaved()
        onOpenChange(false)
    })

    const form = useAppForm({
        defaultValues: { rows: skuTextRowsForEdit(detail.skus) },
        // 行内校验已在字段级通过；换算与「另一维原样回传」的投影规则在 draft-model
        onSubmit: ({ value }) => {
            save.mutate({ productId, items: toSkuUpdateItemsFromText(kind, value.rows) })
        },
    })

    return (
        <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
                e.preventDefault()
                void form.handleSubmit()
            }}
        >
            <div className="text-sm">
                <span className="text-muted-foreground">商品标题：</span>
                <span className="font-medium">{productName}</span>
            </div>

            {/* 超出视口高度内部滚动，避免整卡撑高；overflow-hidden 防止内容溢出到半透明遮罩 */}
            <div className="max-h-dialog-body overflow-y-auto overflow-x-hidden rounded-lg border border-border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="min-w-28">SKU</TableHead>
                            <TableHead>{kind === "price" ? "价格" : "库存"}</TableHead>
                            {kind === "price" && <TableHead>SKU 商家编码</TableHead>}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {form.state.values.rows.map((r, i) => (
                            <TableRow key={r.skuId}>
                                <TableCell
                                    variant="muted"
                                    className="whitespace-nowrap"
                                >
                                    {r.label}
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
                                                            aria-label={`${r.label} 价格`}
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
                                                            元
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
                                                        ? "尚未定价，请先在价格列设置价格再调整库存"
                                                        : countInputSchema.safeParse(value).error
                                                              ?.issues[0]?.message,
                                            }}
                                        >
                                            {(field) => (
                                                <Field className="w-fit">
                                                    <InputGroup className="h-9">
                                                        <InputGroupInput
                                                            aria-label={`${r.label} 库存`}
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
                                                            件
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
                                                    aria-label={`${r.label} 商家编码`}
                                                    maxLength={SKU_CODE_MAX}
                                                    className="w-48"
                                                    placeholder={`选填，最多 ${SKU_CODE_MAX} 位`}
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
                submitLabel="提交"
                onCancel={() => onOpenChange(false)}
            />
        </form>
    )
}
