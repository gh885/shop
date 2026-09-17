import { useEffect, useState } from "react"
import { PackageCheck } from "lucide-react"

import { fenToYuan, toApiError } from "@shop/common"
import { notify } from "@shop/app-kit"
import type { SkuResponse, SkuUpdateItem } from "@shop/api/sdk"
import {
    Button,
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    Input,
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
} from "@shop/ui-web"

import { countInputSchema, yuanPriceSchema } from "#/product/draft-model"
import { useProductDetail, useUpdateProductSkus } from "#/product/queries"

export type SkuEditKind = "price" | "stock"

/** SKU 展示名：规格值组合（attributes 是 {name,value} 快照），无规格值时兜底「默认规格」。
 *  不用 s.name —— 那是「SPU名+规格值」拼接快照，会重复出现商品名。 */
function skuLabel(s: SkuResponse): string {
    const values = s.attributes.map((a) => a.value).filter(Boolean)
    return values.length > 0 ? values.join(" / ") : "默认规格"
}

/** 编辑器内可变的 SKU 行：价格/库存/编码都以文本态承接输入，提交时才统一换算校验。
 *  priceFen/stock 存原始值：编辑价格时原样回传库存、编辑库存时原样回传价格（updateSkus 两者都必填）。 */
interface SkuRow {
    skuId: string
    label: string
    /** 当前价格（分），空/未定价为 null —— 编辑库存时需原样回传，故必存原始值 */
    priceFen: number | null
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
    const [rows, setRows] = useState<SkuRow[]>([])
    const meta = KIND_META[kind]

    // 详情走 query：与发布页回填同一份缓存（productKeys.detail）。
    // 关着弹窗、或没有 productId 时 skipToken 直接不发请求；打开即命中缓存（若发布页刚填过则零请求）。
    // 变量名用 data 而非 detail：下面对它做 undefined 判定（渲染 loading 分支）时，
    // tsgolint 只认 `data === undefined` 这种能收窄 UseQueryResult 的写法
    const { data, isPending, isError, error, onRetry, isFetching } = useProductDetail(
        open ? productId : undefined,
    )

    // 详情到达（或换了商品）时灌进可编辑行：本地行状态仍是编辑会话的真相源，query 只负责喂初值。
    // 用 effect 灌值是有意为之（同 EditTitleDialog 的打开即预填）：行要能改，不能直接读缓存渲染
    useEffect(() => {
        if (!data) return
        // oxlint-disable-next-line react/set-state-in-effect -- 服务端初值 → 本地编辑会话是有意的单向灌值
        setRows(
            data.skus.map((s) => ({
                skuId: s.id,
                label: skuLabel(s),
                priceFen: s.price,
                priceText: s.price === null ? "" : fenToYuan(s.price),
                stockText: String(s.stock),
                stock: s.stock,
                skuCodeText: s.skuCode ?? "",
            })),
        )
    }, [data])

    const save = useUpdateProductSkus(meta.okMessage, () => {
        onSaved()
        onOpenChange(false)
    })

    const updateRow = (skuId: string, patch: Partial<SkuRow>) =>
        setRows((prev) => prev.map((r) => (r.skuId === skuId ? { ...r, ...patch } : r)))

    const submit = async () => {
        if (!productId || !data) return
        // 校验当前维度的输入（价格/库存必须填写合法；库存模式的回传价格必须已设置）
        for (const r of rows) {
            if (kind === "price") {
                const parsed = yuanPriceSchema.safeParse(r.priceText)
                if (!parsed.success) {
                    notify.error(
                        `「${r.label}」价格${parsed.error.issues[0]?.message ?? "格式不正确"}`,
                    )
                    return
                }
            } else {
                const parsed = countInputSchema.safeParse(r.stockText)
                if (!parsed.success) {
                    notify.error(
                        `「${r.label}」库存${parsed.error.issues[0]?.message ?? "格式不正确"}`,
                    )
                    return
                }
                if (r.priceFen === null) {
                    notify.error(`「${r.label}」尚未定价，请先在价格列设置价格再调整库存`)
                    return
                }
            }
        }
        // 校验通过后交给写操作接线；失败提示已在 mutation 的 onError 里统一弹出
        const items: SkuUpdateItem[] = rows.map((r) => {
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
                price: r.priceFen!,
                stock: countInputSchema.parse(r.stockText),
            }
        })
        try {
            await save.mutateAsync({ productId, items })
        } catch {
            // 提示与失效已由 useWriteMutation 处理，这里只吞掉 rejection（unhandled 会被上报）
        }
    }

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

                <div className="space-y-4">
                    {/* 提示条：只改当前维度，另一维度去对应列 */}
                    <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                        <PackageCheck className="size-4 shrink-0" />
                        {meta.notice}
                    </div>

                    {isError ? (
                        <StateError
                            message={toApiError(error).detail}
                            onRetry={onRetry}
                            retrying={isFetching}
                        />
                    ) : isPending ? (
                        <div className="flex max-h-dialog-body flex-col gap-2 overflow-hidden">
                            <Skeleton className="h-9 w-full rounded-sm" />
                            <Skeleton className="h-9 w-full rounded-sm" />
                            <Skeleton className="h-9 w-full rounded-sm" />
                            <Skeleton className="h-9 w-2/3 rounded-sm" />
                        </div>
                    ) : (
                        <>
                            <div className="text-sm">
                                <span className="text-muted-foreground">商品标题：</span>
                                <span className="font-medium">
                                    {productName ?? data.product.name}
                                </span>
                            </div>

                            {/* 超出视口高度内部滚动，避免整卡撑高；overflow-hidden 防止内容溢出到半透明遮罩 */}
                            <div className="max-h-dialog-body overflow-y-auto overflow-x-hidden rounded-lg border border-border">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="min-w-28">SKU</TableHead>
                                            <TableHead>
                                                {kind === "price" ? "价格" : "库存"}
                                            </TableHead>
                                            {kind === "price" && (
                                                <TableHead>SKU 商家编码</TableHead>
                                            )}
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {rows.map((r) => (
                                            <TableRow key={r.skuId}>
                                                <TableCell
                                                    variant="muted"
                                                    className="whitespace-nowrap"
                                                >
                                                    {r.label}
                                                </TableCell>
                                                <TableCell>
                                                    {kind === "price" ? (
                                                        <InputGroup className="h-9 w-fit">
                                                            <InputGroupInput
                                                                aria-label={`${r.label} 价格`}
                                                                inputMode="decimal"
                                                                placeholder="0.00"
                                                                className="w-32 flex-none text-right tabular-nums"
                                                                value={r.priceText}
                                                                onChange={(e) =>
                                                                    updateRow(r.skuId, {
                                                                        priceText: e.target.value,
                                                                    })
                                                                }
                                                            />
                                                            <InputGroupAddon
                                                                align="inline-end"
                                                                variant="quiet"
                                                            >
                                                                元
                                                            </InputGroupAddon>
                                                        </InputGroup>
                                                    ) : (
                                                        <InputGroup className="h-9 w-fit">
                                                            <InputGroupInput
                                                                aria-label={`${r.label} 库存`}
                                                                inputMode="numeric"
                                                                placeholder="0"
                                                                className="w-24 flex-none text-right tabular-nums"
                                                                value={r.stockText}
                                                                onChange={(e) =>
                                                                    updateRow(r.skuId, {
                                                                        stockText:
                                                                            e.target.value.replaceAll(
                                                                                /\D/g,
                                                                                "",
                                                                            ),
                                                                    })
                                                                }
                                                            />
                                                            <InputGroupAddon
                                                                align="inline-end"
                                                                variant="quiet"
                                                            >
                                                                件
                                                            </InputGroupAddon>
                                                        </InputGroup>
                                                    )}
                                                </TableCell>
                                                {kind === "price" && (
                                                    <TableCell>
                                                        <Input
                                                            aria-label={`${r.label} 商家编码`}
                                                            value={r.skuCodeText}
                                                            onChange={(e) =>
                                                                updateRow(r.skuId, {
                                                                    skuCodeText: e.target.value,
                                                                })
                                                            }
                                                            maxLength={64}
                                                            className="w-48 tabular-nums"
                                                            placeholder="选填，最多 64 位"
                                                        />
                                                    </TableCell>
                                                )}
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </>
                    )}
                </div>

                <DialogFooter>
                    <Button
                        variant="secondary"
                        onClick={() => onOpenChange(false)}
                        disabled={save.isPending}
                    >
                        取消
                    </Button>
                    <Button
                        onClick={() => void submit()}
                        disabled={save.isPending || isPending || isError}
                    >
                        {save.isPending ? "提交中…" : "提交"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
