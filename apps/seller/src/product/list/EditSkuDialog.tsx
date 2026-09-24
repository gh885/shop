import { PackageCheck } from "lucide-react"
import { useQuery } from "@tanstack/react-query"

import { type Money, moneyToYuan, toApiError } from "@shop/common"
import type { ProductDetailResponse, SkuResponse, SkuUpdateItem } from "@shop/api/sdk"
import {
    Button,
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    Field,
    FieldError,
    InputGroup,
    InputGroupAddon,
    InputGroupInput,
    Skeleton,
    Spinner,
    StateError,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
    useAppForm,
} from "@shop/ui-web"

import { countInputSchema, yuanPriceSchema } from "#/product/draft-model"
import { SKU_CODE_MAX } from "#/product/constants"
import { productDetailOptions, useUpdateProductSkus } from "#/product/queries"

export type SkuEditKind = "price" | "stock"

/** SKU 展示名：规格值组合（attributes 是 {name,value} 快照），无规格值时兜底「默认规格」。
 *  不用 s.name —— 那是「SPU名+规格值」拼接快照，会重复出现商品名。 */
function skuLabel(s: SkuResponse): string {
    const values = s.attributes.map((a) => a.value).filter(Boolean)
    return values.length > 0 ? values.join(" / ") : "默认规格"
}

/** 编辑器内可变的 SKU 行：价格/库存/编码都以文本态承接输入，提交时才统一换算校验。
 *  price/stock 存原始值：编辑价格时原样回传库存、编辑库存时原样回传价格（updateSkus 两者都必填）。 */
interface SkuRow {
    skuId: string
    label: string
    /** 当前价格（Money），未定价为 null —— 编辑库存时需原样回传，故必存原始值 */
    price: Money | null
    priceText: string
    stockText: string
    /** 当前库存（编辑价格时原样回传，避免绝对量被误清零） */
    stock: number
    skuCodeText: string
}

const KIND_META: Record<SkuEditKind, { title: string; notice: string; okMessage: string }> = {
    price: {
        title: "编辑 SKU",
        notice: "库存调整请点库存列进入「编辑库存」，此处只调整价格与商家编码。",
        okMessage: "SKU 价格已更新",
    },
    stock: {
        title: "编辑库存",
        notice: "价格调整请点价格列进入「编辑 SKU」，此处只调整库存。",
        okMessage: "库存已更新",
    },
}

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
    const meta = KIND_META[kind]

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

                {isError ? (
                    <StateError
                        message={toApiError(error).detail}
                        onRetry={() => void refetch()}
                        retrying={isFetching}
                    />
                ) : isPending || !productId ? (
                    <div className="flex max-h-dialog-body flex-col gap-2 overflow-hidden">
                        <Skeleton className="h-9 w-full rounded-sm" />
                        <Skeleton className="h-9 w-full rounded-sm" />
                        <Skeleton className="h-9 w-full rounded-sm" />
                        <Skeleton className="h-9 w-2/3 rounded-sm" />
                    </div>
                ) : (
                    <SkuLineForm
                        kind={kind}
                        productId={productId}
                        productName={productName ?? data.product.name}
                        detail={data}
                        onOpenChange={onOpenChange}
                        onSaved={onSaved}
                    />
                )}
            </DialogContent>
        </Dialog>
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
    const meta = KIND_META[kind]
    const save = useUpdateProductSkus(meta.okMessage, () => {
        onSaved()
        onOpenChange(false)
    })

    const form = useAppForm({
        defaultValues: {
            rows: detail.skus.map((s): SkuRow => ({
                skuId: s.id,
                label: skuLabel(s),
                price: s.price,
                priceText: moneyToYuan(s.price),
                stockText: String(s.stock),
                stock: s.stock,
                skuCodeText: s.skuCode ?? "",
            })),
        },
        onSubmit: ({ value }) => {
            // 行内校验已在字段级 onSubmit 通过；这里只做换算与投影
            const items: SkuUpdateItem[] = value.rows.map((r) => {
                if (kind === "price") {
                    const skuCode = r.skuCodeText.trim()
                    return {
                        skuId: r.skuId,
                        price: yuanPriceSchema.parse(r.priceText),
                        stock: r.stock,
                        ...(skuCode ? { skuCode } : {}),
                    }
                }
                return {
                    skuId: r.skuId,
                    price: r.price!,
                    stock: countInputSchema.parse(r.stockText),
                }
            })
            save.mutate({ productId, items })
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
                                                    placeholder="选填，最多 64 位"
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

            <DialogFooter>
                <Button
                    type="button"
                    variant="outline"
                    onClick={() => onOpenChange(false)}
                    disabled={save.isPending}
                >
                    取消
                </Button>
                <Button
                    type="submit"
                    disabled={save.isPending}
                >
                    {save.isPending && <Spinner />}提交
                </Button>
            </DialogFooter>
        </form>
    )
}
