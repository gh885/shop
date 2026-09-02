import { useState } from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { ArrowLeft, MapPin } from "lucide-react"

import { Button, Separator, Skeleton } from "@shop/ui-web"
import { fenToYuan } from "@shop/api"

import { useAddressList, type Address } from "#/address"
import {
    useCheckoutPreview,
    useCreateOrder,
    type CheckoutPreview,
    type CheckoutSource,
} from "#/checkout"
import { notify } from "#/shared/lib/toast"

export const Route = createFileRoute("/_protected/checkout")({
    // 结算来源：cartItemIds（购物车）与 buySkuId+buyQuantity（立即购买）二选一
    validateSearch: (search: Record<string, unknown>): CheckoutSource => {
        const parsed = search.cartItemIds
        const ids = Array.isArray(parsed)
            ? parsed.filter((x): x is string => typeof x === "string")
            : typeof parsed === "string"
              ? [parsed]
              : []
        return {
            cartItemIds: ids.length > 0 ? ids : undefined,
            buySkuId: typeof search.buySkuId === "string" ? search.buySkuId : undefined,
            buyQuantity:
                typeof search.buyQuantity === "number" && search.buyQuantity > 0
                    ? search.buyQuantity
                    : undefined,
        }
    },
    component: CheckoutPage,
    head: () => ({ meta: [{ title: "结算 - Shop" }] }),
})

function CheckoutPage() {
    const navigate = useNavigate()
    const source = Route.useSearch()
    const { data: addresses } = useAddressList()
    const createOrder = useCreateOrder()

    const [addressId, setAddressId] = useState("")
    // 默认选中：已勾选的，否则默认地址，兜底第一条——提交/预览都可用
    const defaultAddress = addresses?.find((a) => a.isDefault) ?? addresses?.[0]
    const effectiveAddressId = addressId || defaultAddress?.id || ""
    const preview = useCheckoutPreview({ source, addressId: effectiveAddressId || undefined })

    const submit = () => {
        if (!effectiveAddressId) {
            notify.info("请选择收货地址")
            return
        }
        createOrder.mutate(
            { addressId: effectiveAddressId, source },
            {
                onSuccess: (res) => {
                    const orders = res?.orders ?? []
                    if (orders.length === 0) {
                        notify.error("订单创建失败")
                        return
                    }
                    // 一次结算按店拆单，可能多单：V1 统一跳第一单支付页（支付按单逐单处理）
                    void navigate({
                        to: "/pay/$orderId",
                        params: { orderId: orders[0].id ?? "" },
                        search: { orderIds: orders.map((o) => o.id ?? "") },
                    })
                },
            },
        )
    }

    return (
        <>
            <CheckoutHeader />
            <div className="mx-auto w-full max-w-(--container-page) px-6 pb-10">
                {preview.isLoading ? (
                    <div className="space-y-5">
                        <Skeleton className="h-40 w-full rounded-2xl" />
                        <Skeleton className="h-40 w-full rounded-2xl" />
                    </div>
                ) : (
                    <div className="flex gap-6">
                        {/* 左：地址 + 商品分组 + 失效行 */}
                        <div className="min-w-0 flex-1 space-y-5">
                            <AddressPicker
                                addresses={addresses ?? []}
                                value={addressId}
                                onChange={setAddressId}
                            />
                            {preview.data?.groups.map((g) => (
                                <GroupCard
                                    key={g.shopId}
                                    group={g}
                                />
                            ))}
                            {preview.data && <UnavailableCard lines={preview.data.unavailable} />}
                        </div>

                        {/* 右：金额结算卡 */}
                        <div className="w-80 shrink-0">
                            <div className="sticky top-4 rounded-2xl bg-background p-6 ring-1 ring-border/60">
                                <h2 className="text-lg font-semibold">结算</h2>
                                <div className="mt-4 space-y-2 text-sm">
                                    <Row label="商品总额">
                                        ¥{fenToYuan(preview.data?.totalPayAmount.amount ?? 0)}
                                    </Row>
                                    <Row label="运费">
                                        ¥
                                        {fenToYuan(
                                            preview.data?.groups.reduce(
                                                (s, g) => s + (g.shippingFee.amount ?? 0),
                                                0,
                                            ) ?? 0,
                                        )}
                                    </Row>
                                </div>
                                <Separator className="my-4" />
                                <div className="flex items-end justify-between">
                                    <span className="text-sm text-muted-foreground">
                                        应付总额：
                                    </span>
                                    <span className="text-2xl font-bold text-primary">
                                        ¥{fenToYuan(preview.data?.totalPayAmount.amount ?? 0)}
                                    </span>
                                </div>
                                <Button
                                    className="mt-5 h-12 w-full rounded-xl bg-linear-to-r from-primary to-primary-hover text-base text-white"
                                    disabled={!addressId || createOrder.isPending}
                                    onClick={submit}
                                >
                                    {createOrder.isPending ? "提交中…" : "提交订单"}
                                </Button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </>
    )
}

function CheckoutHeader() {
    const navigate = useNavigate()
    return (
        <header className="border-b border-border/60 bg-background">
            <div className="mx-auto flex h-16 w-full max-w-(--container-page) items-center gap-4 px-6">
                <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1"
                    onClick={() => void navigate({ to: "/cart" })}
                >
                    <ArrowLeft className="size-4" />
                    返回购物车
                </Button>
                <h1 className="text-xl font-semibold text-foreground">确认订单</h1>
            </div>
        </header>
    )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex items-center justify-between">
            <span className="text-muted-foreground">{label}</span>
            <span className="text-foreground">{children}</span>
        </div>
    )
}

function AddressPicker({
    addresses,
    value,
    onChange,
}: {
    addresses: Address[]
    value: string
    onChange: (id: string) => void
}) {
    if (addresses.length === 0) {
        return (
            <div className="rounded-2xl bg-background p-6 ring-1 ring-border/60">
                <p className="text-sm text-muted-foreground">请先添加收货地址</p>
            </div>
        )
    }
    // 默认选中：已勾选的，否则默认地址
    const effectiveId = value || addresses.find((a) => a.isDefault)?.id || addresses[0].id
    return (
        <div className="rounded-2xl bg-background p-4 ring-1 ring-border/60">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
                <MapPin className="size-4 text-primary" />
                收货地址
            </div>
            <div className="space-y-2">
                {addresses.map((a) => (
                    <label
                        key={a.id}
                        className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm transition-colors ${
                            effectiveId === a.id
                                ? "border-primary bg-primary/5"
                                : "border-border/60 hover:bg-muted/40"
                        }`}
                    >
                        <input
                            type="radio"
                            name="address"
                            checked={effectiveId === a.id}
                            onChange={() => onChange(a.id)}
                            className="size-3.5 accent-primary"
                        />
                        <span className="font-medium">
                            {a.receiver} {a.phone}
                        </span>
                        <span className="text-muted-foreground">
                            {a.province}
                            {a.city}
                            {a.district}
                            {a.detail}
                        </span>
                    </label>
                ))}
            </div>
        </div>
    )
}

type CheckoutGroup = CheckoutPreview["groups"][number]

function GroupCard({ group }: { group: CheckoutGroup }) {
    return (
        <div className="rounded-2xl bg-background ring-1 ring-border/60">
            <div className="flex items-center gap-2 border-b border-border/60 px-5 py-3.5 text-sm font-medium">
                <span className="inline-flex size-5 items-center justify-center rounded bg-primary text-xs font-bold text-white">
                    店
                </span>
                {group.shopName}
            </div>
            <div className="divide-y divide-border/40">
                {group.lines.map((l) => (
                    <div
                        key={`${l.skuId}-${l.productId}`}
                        className="flex items-center gap-4 px-5 py-4"
                    >
                        <img
                            src={l.image}
                            alt={l.name}
                            className="size-16 shrink-0 rounded-md bg-muted object-cover"
                        />
                        <div className="min-w-0 flex-1">
                            <p className="line-clamp-2 text-sm text-foreground">{l.name}</p>
                        </div>
                        <div className="w-20 shrink-0 text-right text-sm">
                            <span className="font-bold text-foreground">
                                ¥{fenToYuan(l.price.amount)}
                            </span>
                            <span className="ml-1 text-xs text-muted-foreground">
                                x{l.quantity}
                            </span>
                        </div>
                        <div className="w-20 shrink-0 text-right text-sm font-bold text-foreground">
                            ¥{fenToYuan(l.price.amount * l.quantity)}
                        </div>
                    </div>
                ))}
            </div>
            <div className="flex items-center justify-end gap-6 border-t border-border/60 px-5 py-3 text-sm">
                <span className="text-muted-foreground">
                    商品总额{" "}
                    <b className="text-foreground">¥{fenToYuan(group.itemAmount.amount)}</b> + 运费{" "}
                    <b className="text-foreground">¥{fenToYuan(group.shippingFee.amount)}</b>
                </span>
                <span className="text-muted-foreground">
                    应付 <b className="text-primary">¥{fenToYuan(group.payAmount.amount)}</b>
                </span>
            </div>
        </div>
    )
}

function UnavailableCard({ lines }: { lines: CheckoutPreview["unavailable"] }) {
    if (lines.length === 0) return
    return (
        <div className="rounded-2xl bg-muted/40 p-5 ring-1 ring-border/60">
            <div className="flex items-center gap-2 text-sm font-medium text-destructive">
                <MapPin className="size-4" />
                以下商品已失效
            </div>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                {lines.map((l) => (
                    <li key={l.skuId}>
                        {l.name} x{l.quantity}（{l.cause}）
                    </li>
                ))}
            </ul>
        </div>
    )
}
