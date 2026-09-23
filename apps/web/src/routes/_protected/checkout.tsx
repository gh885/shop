import { addressListOptions, type Address } from "#/address"
import {
    CouponPicker,
    GroupAmountSentence,
    withDefaultCoupons,
    type CheckoutGroup,
    type CheckoutSource,
    type CouponSelection,
    type UnavailableLine,
    useCreateOrder,
    checkoutPreviewOptions,
} from "#/checkout"
import { formatMoney, isPositiveMoney, sumMoney, timesMoney } from "@shop/common"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useQuery, useSuspenseQuery } from "@tanstack/react-query"
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
    Image,
    Textarea,
} from "@shop/ui-web"
import { z } from "zod"

// 结算行由 TanStack Router 以 JSON 编进 URL；脏值一律 catch 成空数组，走「无可结算条目」流程
const checkoutSearchSchema = z.object({
    // oxlint-disable-next-line unicorn/prefer-top-level-await -- zod 的 .catch() 是解析兜底，非 Promise
    lines: z
        .array(z.object({ skuId: z.string(), quantity: z.coerce.number().int().positive() }))
        .catch([]),
})

export const Route = createFileRoute("/_protected/checkout")({
    // 结算来源：一组 skuId + 件数，购物车勾选与立即购买在入口处归约成同一形状
    validateSearch: (search: Record<string, unknown>): CheckoutSource =>
        checkoutSearchSchema.parse(search),
    /**
     * 地址列表是页面主体（没有收货地址就没法提交）→ loader 读完再渲染；
     * 预览依赖地址与选券的**本地状态**，不能进 loader，仍由组件侧 query 读取（带 enabled + placeholderData）。
     * 挂起 → pendingComponent，失败 → 路由错误页 + 官方重置重试；SSR 阶段直接跳过。
     */
    loader: async ({ context }) => {
        if (import.meta.env.SSR) return
        await context.queryClient.query({ ...addressListOptions, staleTime: "static" })
    },
    pendingComponent: CheckoutSkeleton,
    component: CheckoutPage,
    head: () => ({ meta: [{ title: "结算 - Shop" }] }),
})

/** 挂起占位：与结算页同形（地址卡 + 商品分组 + 右栏金额） */
function CheckoutSkeleton() {
    return (
        <div className="mx-auto w-full max-w-page px-6 py-6">
            <Skeleton className="h-8 w-40" />
            <div className="mt-6 flex gap-6">
                <div className="flex-1 space-y-4">
                    <Skeleton className="h-24 w-full rounded-xl" />
                    <Skeleton className="h-40 w-full rounded-xl" />
                </div>
                <Skeleton className="h-40 w-80 rounded-xl" />
            </div>
        </div>
    )
}

function CheckoutPage() {
    const navigate = useNavigate()
    const source = Route.useSearch()
    // 地址由 loader 读完（失败已由路由错误页接管）
    const addresses = useSuspenseQuery(addressListOptions).data
    const createOrder = useCreateOrder()

    const [addressId, setAddressId] = useState("")
    // 买家留言：整次结算一份，随下单透传给后端（按店拆单时逐单落 buyerMessage 快照，可空、最长 200 字）
    const [buyerMessage, setBuyerMessage] = useState("")
    // 每店选中的券：键存在 = 用户已表态（值可为 null = 明确不用券）。这一层只装「用户的决定」，
    // 没表态的店由下面的 effect 补默认值——「未表态」与「选了不用」必须能分开，否则默认选券会覆盖用户。
    const [couponSelection, setCouponSelection] = useState<CouponSelection>({})
    // 默认选中：已勾选的，否则默认地址，兜底第一条——提交/预览都可用
    const defaultAddress = addresses.find((a) => a.isDefault) ?? addresses[0]
    const effectiveAddressId = addressId || defaultAddress?.id || ""
    const preview = useQuery(
        checkoutPreviewOptions({
            source,
            addressId: effectiveAddressId || undefined,
            coupons: couponSelection,
        }),
    )

    // 默认选券：后端不会替你选（appliedCouponId 只是回显传过去的 id），首屏拿到候选后取「第一张可用券」。
    // 只补用户还没表态的店、清掉已不在本次结算里的店；改过的选择（含明确选「不使用」）原样保留。
    // 补上默认值会让预览 key 变化并重新预览一次，这是必要的：不重算就没有券后价。
    const previewGroups = preview.data?.groups
    useEffect(() => {
        if (!previewGroups) return
        // oxlint-disable-next-line react/set-state-in-effect -- 只在预览数据到达时补默认选券（首屏一次性），渲染期派生会覆盖用户明确的选择
        setCouponSelection((prev) => withDefaultCoupons(previewGroups, prev))
    }, [previewGroups])

    const summaryGroups = preview.data?.groups ?? []
    const totalItemAmount = sumMoney(summaryGroups.map((g) => g.itemAmount))
    const totalShippingFee = sumMoney(summaryGroups.map((g) => g.shippingFee))
    const totalDiscountAmount = sumMoney(summaryGroups.map((g) => g.discountAmount))

    const submit = () => {
        if (!effectiveAddressId) {
            notify.info("请选择收货地址")
            return
        }
        createOrder.mutate(
            {
                addressId: effectiveAddressId,
                source,
                coupons: couponSelection,
                buyerMessage: buyerMessage.trim() || undefined,
            },
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
                                addresses={addresses}
                                value={addressId}
                                onChange={setAddressId}
                            />
                            {preview.data?.groups.map((g) => (
                                <GroupCard
                                    key={g.shopId}
                                    group={g}
                                    // oxlint-disable-next-line no-null -- CouponSelection 契约：null = 明确选「不使用优惠券」
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

                            {/* 买家留言：整次结算一份（按店拆单时逐单落同一句），给卖家交代发货相关的小要求 */}
                            <Card>
                                <CardHeader>
                                    <CardTitle>买家留言</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <Textarea
                                        value={buyerMessage}
                                        onChange={(e) => setBuyerMessage(e.target.value)}
                                        maxLength={200}
                                        rows={2}
                                        placeholder="选填，最多 200 字，如发货时间、包装上的要求"
                                    />
                                </CardContent>
                            </Card>
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
                                    {isPositiveMoney(totalDiscountAmount) && (
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
                                        {preview.data ? (
                                            <Price
                                                value={preview.data.totalPayAmount}
                                                className="text-2xl font-bold text-primary"
                                            />
                                        ) : (
                                            /* 预览没回来：没有应付可说，显式占位而不是摆一个 ¥0.00 像免单 */
                                            <span className="text-2xl font-bold text-primary">
                                                —
                                            </span>
                                        )}
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
                >
                    {addresses.map((a) => (
                        <Item
                            key={a.id}
                            variant={effectiveId === a.id ? "selected" : "selectable"}
                            size="sm"
                        >
                            <RadioGroupItem value={a.id} />
                            <ItemContent>
                                <ItemTitle>
                                    {a.receiver} {a.phone}
                                </ItemTitle>
                                <ItemDescription lines={1}>
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
            <PanelHeader>
                <div className="flex items-center gap-2 font-medium">
                    <span className="inline-flex size-5 items-center justify-center rounded bg-secondary text-xs font-bold text-secondary-foreground">
                        店
                    </span>
                    {group.shopName}
                </div>
            </PanelHeader>
            <PanelContent>
                {group.lines.map((l) => (
                    <Item
                        key={`${l.skuId}-${l.productId}`}
                        variant="plain"
                        size="lg"
                    >
                        <ItemMedia variant="thumbnail">
                            <Image
                                src={l.image}
                                alt={l.name}
                                className="size-full"
                            />
                        </ItemMedia>
                        <ItemContent>
                            <ItemTitle
                                lines={2}
                                className="w-full"
                            >
                                {l.name}
                            </ItemTitle>
                        </ItemContent>
                        <ItemActions className="gap-6 self-center">
                            <div className="w-20 text-right">
                                <span className="font-bold">{formatMoney(l.price)}</span>
                                <span className="ml-1 text-xs text-muted-foreground">
                                    x{l.quantity}
                                </span>
                            </div>
                            <div className="w-20 text-right font-bold tabular-nums">
                                <Price
                                    value={timesMoney(l.price, l.quantity)}
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
                        value={group.payAmount}
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
            className="flex-col items-start"
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
