import { useAddressList, type Address } from "#/address"
import {
    CouponPicker,
    GroupAmountSentence,
    withDefaultCoupons,
    type CheckoutGroup,
    type CheckoutSource,
    type CouponSelection,
    type UnavailableLine,
    useCreateOrder,
    useCheckoutPreview,
} from "#/checkout"
import { fenToYuan } from "@shop/common"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { ArrowLeft, MapPin, CircleAlert } from "lucide-react"
import { useEffect, useState } from "react"
import { notify } from "@shop/app-kit"

import { Price } from "#/shared/ui/Price"
import { DiscountPrice } from "#/shared/ui/DiscountPrice"
import {
    Skeleton,
    Button,
    Card,
    CardHeader,
    CardTitle,
    CardContent,
    Separator,
    CardFooter,
    Spinner,
    Empty,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
    EmptyDescription,
    RadioGroup,
    Item,
    RadioGroupItem,
    ItemContent,
    ItemTitle,
    ItemDescription,
    Panel,
    PanelHeader,
    PanelContent,
    ItemMedia,
    ItemActions,
} from "@shop/ui-web"
import { z } from "zod"

// 结算行由 TanStack Router 以 JSON 编进 URL；脏值一律 catch 成空数组，走「无可结算条目」流程
const checkoutSearchSchema = z.object({
    lines: z
        .array(z.object({ skuId: z.string(), quantity: z.coerce.number().int().positive() }))
        .catch([]),
})

export const Route = createFileRoute("/_protected/checkout")({
    // 结算来源：一组 skuId + 件数，购物车勾选与立即购买在入口处归约成同一形状
    validateSearch: (search: Record<string, unknown>): CheckoutSource =>
        checkoutSearchSchema.parse(search),
    component: CheckoutPage,
    head: () => ({ meta: [{ title: "结算 - Shop" }] }),
})

function CheckoutPage() {
    const navigate = useNavigate()
    const source = Route.useSearch()
    const { data: addresses } = useAddressList()
    const createOrder = useCreateOrder()

    const [addressId, setAddressId] = useState("")
    // 每店选中的券：键存在 = 用户已表态（值可为 null = 明确不用券）。这一层只装「用户的决定」，
    // 没表态的店由下面的 effect 补默认值——「未表态」与「选了不用」必须能分开，否则默认选券会覆盖用户。
    const [couponSelection, setCouponSelection] = useState<CouponSelection>({})
    // 默认选中：已勾选的，否则默认地址，兜底第一条——提交/预览都可用
    const defaultAddress = addresses?.find((a) => a.isDefault) ?? addresses?.[0]
    const effectiveAddressId = addressId || defaultAddress?.id || ""
    const preview = useCheckoutPreview({
        source,
        addressId: effectiveAddressId || undefined,
        coupons: couponSelection,
    })

    // 默认选券：后端不会替你选（appliedCouponId 只是回显传过去的 id），首屏拿到候选后取「第一张可用券」。
    // 只补用户还没表态的店、清掉已不在本次结算里的店；改过的选择（含明确选「不使用」）原样保留。
    // 补上默认值会让预览 key 变化并重新预览一次，这是必要的：不重算就没有券后价。
    const previewGroups = preview.data?.groups
    useEffect(() => {
        if (!previewGroups) return
        setCouponSelection((prev) => withDefaultCoupons(previewGroups, prev))
    }, [previewGroups])

    const summaryGroups = preview.data?.groups ?? []
    const totalItemAmount = summaryGroups.reduce((s, g) => s + g.itemAmount.amount, 0)
    const totalShippingFee = summaryGroups.reduce((s, g) => s + g.shippingFee.amount, 0)
    const totalDiscountAmount = summaryGroups.reduce((s, g) => s + g.discountAmount.amount, 0)

    const submit = () => {
        if (!effectiveAddressId) {
            notify.info("请选择收货地址")
            return
        }
        createOrder.mutate(
            { addressId: effectiveAddressId, source, coupons: couponSelection },
            {
                onSuccess: (res) => {
                    const orders = res.orders
                    if (orders.length === 0) {
                        notify.error("订单创建失败")
                        return
                    }
                    // 一次结算按店拆单，可能多单：V1 统一跳第一单支付页（支付按单逐单处理）
                    void navigate({
                        to: "/pay/$orderId",
                        params: { orderId: orders[0]!.id },
                        search: { orderIds: orders.map((o) => o.id) },
                    })
                },
            },
        )
    }

    return (
        <>
            <CheckoutHeader />
            <div className="mx-auto w-full max-w-page px-6 pb-10">
                {preview.isLoading ? (
                    <div className="space-y-5">
                        <Skeleton className="h-40 w-full rounded-lg" />
                        <Skeleton className="h-40 w-full rounded-lg" />
                    </div>
                ) : preview.isError ? (
                    <div className="flex flex-col items-center gap-4 py-16 text-sm text-muted-foreground">
                        <span>结算信息加载失败，请重试</span>
                        <Button
                            variant="outline"
                            onClick={() => void preview.refetch()}
                        >
                            重新加载
                        </Button>
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
                                    selectedCouponId={couponSelection[g.shopId] ?? null}
                                    onSelectCoupon={(userCouponId) =>
                                        setCouponSelection((prev) => ({
                                            ...prev,
                                            [g.shopId]: userCouponId,
                                        }))
                                    }
                                />
                            ))}
                            {preview.data && <UnavailableCard lines={preview.data.unavailable} />}
                        </div>

                        {/* 右：金额结算卡 */}
                        <div className="w-80 shrink-0">
                            <Card className="sticky top-4">
                                <CardHeader>
                                    <CardTitle>结算</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-2">
                                    {/* 金额口径：商品总价 + 运费 − 优惠 = 应付总额。
                                        顶层 totalPayAmount 已是净额，不能拿来当「商品总价」（那是加了券之前的数）。 */}
                                    <Row label="商品总价">
                                        <Price
                                            value={totalItemAmount}
                                            className="text-sm"
                                        />
                                    </Row>
                                    <Row label="运费">
                                        <Price
                                            value={totalShippingFee}
                                            className="text-sm"
                                        />
                                    </Row>
                                    {totalDiscountAmount > 0 && (
                                        <Row label="优惠">
                                            <DiscountPrice
                                                value={totalDiscountAmount}
                                                className="text-sm"
                                            />
                                        </Row>
                                    )}
                                    <Separator />
                                    <div className="flex items-end justify-between">
                                        <span className="text-muted-foreground">应付总额：</span>
                                        <Price
                                            value={preview.data?.totalPayAmount.amount ?? 0}
                                            className="text-2xl font-bold text-primary"
                                        />
                                    </div>
                                </CardContent>
                                <CardFooter>
                                    <Button
                                        variant="cta"
                                        className="h-12 w-full"
                                        disabled={!effectiveAddressId || createOrder.isPending}
                                        onClick={submit}
                                    >
                                        {createOrder.isPending && <Spinner />}提交订单
                                    </Button>
                                </CardFooter>
                            </Card>
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
            <div className="mx-auto flex h-16 w-full max-w-page items-center gap-4 px-6">
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
    const navigate = useNavigate()
    if (addresses.length === 0) {
        return (
            <Card>
                <CardContent>
                    <Empty>
                        <EmptyHeader>
                            <EmptyMedia variant="icon">
                                <MapPin />
                            </EmptyMedia>
                            <EmptyTitle>还没有收货地址</EmptyTitle>
                            <EmptyDescription>添加收货地址后即可提交订单。</EmptyDescription>
                            <Button
                                variant="outline"
                                className="mt-2"
                                onClick={() => void navigate({ to: "/account/address" })}
                            >
                                去添加地址
                            </Button>
                        </EmptyHeader>
                    </Empty>
                </CardContent>
            </Card>
        )
    }
    // 默认选中：已勾选的，否则默认地址
    const effectiveId = value || addresses.find((a) => a.isDefault)?.id || addresses[0]!.id
    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <MapPin className="size-4 text-muted-foreground" />
                    收货地址
                </CardTitle>
            </CardHeader>
            <CardContent>
                <RadioGroup
                    value={effectiveId}
                    onValueChange={(v: string) => onChange(v)}
                    className="gap-2"
                >
                    {addresses.map((a) => (
                        <Item
                            key={a.id}
                            variant={effectiveId === a.id ? "default" : "outline"}
                            size="sm"
                            className={
                                effectiveId === a.id
                                    ? "border-foreground bg-accent"
                                    : "hover:bg-muted/40"
                            }
                        >
                            <RadioGroupItem value={a.id} />
                            <ItemContent>
                                <ItemTitle className="text-sm font-medium">
                                    {a.receiver} {a.phone}
                                </ItemTitle>
                                <ItemDescription className="line-clamp-1">
                                    {a.province}
                                    {a.city}
                                    {a.district}
                                    {a.detail}
                                </ItemDescription>
                            </ItemContent>
                        </Item>
                    ))}
                </RadioGroup>
            </CardContent>
        </Card>
    )
}

function GroupCard({
    group,
    selectedCouponId,
    onSelectCoupon,
}: {
    group: CheckoutGroup
    selectedCouponId: string | null
    onSelectCoupon: (userCouponId: string | null) => void
}) {
    return (
        <Panel>
            <PanelHeader className="gap-2 text-sm font-medium">
                <span className="inline-flex size-5 items-center justify-center rounded bg-secondary text-xs font-bold text-secondary-foreground">
                    店
                </span>
                {group.shopName}
            </PanelHeader>
            <PanelContent>
                {group.lines.map((l) => (
                    <Item
                        key={`${l.skuId}-${l.productId}`}
                        size="sm"
                        className="rounded-none border-0 px-5 py-4"
                    >
                        <ItemMedia
                            variant="image"
                            className="size-16 shrink-0 rounded-md bg-muted"
                        >
                            {l.image && (
                                <img
                                    src={l.image}
                                    alt={l.name}
                                />
                            )}
                        </ItemMedia>
                        <ItemContent>
                            <ItemTitle className="line-clamp-2 w-full text-sm font-normal">
                                {l.name}
                            </ItemTitle>
                        </ItemContent>
                        <ItemActions className="gap-6 self-center">
                            <div className="w-20 text-right">
                                <span className="font-bold">{fenToYuan(l.price.amount)}</span>
                                <span className="ml-1 text-xs text-muted-foreground">
                                    x{l.quantity}
                                </span>
                            </div>
                            <div className="w-20 text-right font-bold tabular-nums">
                                <Price
                                    value={l.price.amount * l.quantity}
                                    className="text-sm"
                                />
                            </div>
                        </ItemActions>
                    </Item>
                ))}
            </PanelContent>
            <CouponPicker
                group={group}
                selectedId={selectedCouponId}
                onSelect={onSelectCoupon}
            />
            <div className="flex items-center justify-end gap-6 border-t border-border/60 px-5 py-3 text-sm">
                <GroupAmountSentence
                    itemAmount={group.itemAmount}
                    shippingFee={group.shippingFee}
                    discountAmount={group.discountAmount}
                />
                <span className="text-muted-foreground">
                    应付{" "}
                    <Price
                        value={group.payAmount.amount}
                        className="text-sm font-bold text-primary"
                    />
                </span>
            </div>
        </Panel>
    )
}

function UnavailableCard({ lines }: { lines: UnavailableLine[] }) {
    if (lines.length === 0) return
    return (
        <Item
            variant="muted"
            className="flex-col items-start gap-2"
        >
            <div className="flex items-center gap-2 font-medium text-destructive">
                <CircleAlert className="size-4" />
                以下商品已失效
            </div>
            <ul className="text-muted-foreground">
                {lines.map((l) => (
                    <li key={l.skuId}>
                        {l.name} x{l.quantity}（{l.cause}）
                    </li>
                ))}
            </ul>
        </Item>
    )
}
