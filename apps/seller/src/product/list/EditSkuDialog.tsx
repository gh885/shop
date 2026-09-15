import { useEffect, useState } from "react"
import { PackageCheck } from "lucide-react"

import { fenToYuan, toApiError } from "@shop/common"
import { notify } from "@shop/app-kit"
import { ProductsAdminApi, type ProductDetailResponse, type SkuResponse } from "@shop/api/sdk"
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
 * - 生命周期：受控（open/productId 由外层持有），onSaved 用于保存后让外层失效列表。
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
    const [detail, setDetail] = useState<ProductDetailResponse | undefined>()
    const [rows, setRows] = useState<SkuRow[]>([])
    const [loading, setLoading] = useState(false)
    const [loadError, setLoadError] = useState<string>()
    const [submitting, setSubmitting] = useState(false)
    const [reloadKey, setReloadKey] = useState(0)
    const meta = KIND_META[kind]

    // 每次打开都重新拉详情（受控 open + productId 变化驱动；reloadKey 供加载失败后重试）
    useEffect(() => {
        if (!open || !productId) return
        let cancelled = false
        const loadDetail = async () => {
            setLoading(true)
            setLoadError(undefined)
            setDetail(undefined)
            try {
                const d = await ProductsAdminApi.getShopProductDetail({ path: { id: productId } })
                if (!cancelled) {
                    setDetail(d)
                    setRows(
                        d.skus.map((s) => ({
                            skuId: s.id,
                            label: skuLabel(s),
                            priceFen: s.price,
                            priceText: s.price === null ? "" : fenToYuan(s.price),
                            stockText: String(s.stock),
                            stock: s.stock,
                            skuCodeText: s.skuCode ?? "",
                        })),
                    )
                }
            } catch (error) {
                if (!cancelled) setLoadError(toApiError(error).detail)
            } finally {
                if (!cancelled) setLoading(false)
            }
        }
        void loadDetail()
        return () => {
            cancelled = true
        }
    }, [open, productId, reloadKey])

    const updateRow = (skuId: string, patch: Partial<SkuRow>) =>
        setRows((prev) => prev.map((r) => (r.skuId === skuId ? { ...r, ...patch } : r)))

    const submit = async () => {
        if (!productId || !detail) return
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
        setSubmitting(true)
        try {
            await ProductsAdminApi.updateProductSkus({
                path: { id: productId },
                body: {
                    items: rows.map((r) => {
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
                    }),
                },
            })
            notify.success(meta.okMessage)
            onSaved()
            onOpenChange(false)
        } catch (error) {
            notify.fromError(error, "保存失败")
        } finally {
            setSubmitting(false)
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

                    {loadError ? (
                        <StateError
                            message={loadError}
                            onRetry={() => setReloadKey((k) => k + 1)}
                        />
                    ) : loading || !detail ? (
                        <div className="flex max-h-(--max-height-dialog-body) flex-col gap-2 overflow-hidden">
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
                                    {productName ?? detail.product.name}
                                </span>
                            </div>

                            {/* 超出视口高度内部滚动，避免整卡撑高；overflow-hidden 防止内容溢出到半透明遮罩 */}
                            <div className="max-h-(--max-height-dialog-body) overflow-y-auto overflow-x-hidden rounded-lg border border-border">
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
                        disabled={submitting}
                    >
                        取消
                    </Button>
                    <Button
                        onClick={() => void submit()}
                        disabled={submitting || loading || Boolean(loadError)}
                    >
                        {submitting ? "提交中…" : "提交"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
