import type {
    OrderAvailableAction,
    OrderDetailResponse,
    OrderListItemResponse,
} from "@shop/api/sdk"
import { describe, expect, it } from "vitest"

import {
    ORDER_ACTION_META,
    ORDER_ACTION_ORDER,
    ORDER_PROGRESS_STEP,
    ORDER_STATUS_LABEL,
} from "./constants"
import { deriveOrderActions } from "./model"
import { toOrder, toOrderActions, toOrderDetail } from "./order"

/**
 * 测试夹具：订单 wire 形状可控构造。
 * 关心维度：状态枚举（PAID → pending_shipment 是投影语义的关键）、快照字段、可空字段。
 */
const MONEY = { amount: 19900, currency: "CNY" }

function makeItemDto(
    opts: {
        name?: string
        image?: string | null
        quantity?: number
        /** 下单瞬间定格的划线价；默认与成交价相等（没让钱是常态） */
        originalPrice?: typeof MONEY | null
    } = {},
): OrderListItemResponse["items"][number] {
    return {
        orderItemId: "00000000-0000-7000-8000-000000000001",
        productId: "p-1",
        skuId: "sku-1",
        name: opts.name ?? "测试商品",
        image: opts.image ?? null,
        price: MONEY,
        originalPrice: "originalPrice" in opts ? (opts.originalPrice ?? null) : MONEY,
        quantity: opts.quantity ?? 1,
        amount: MONEY,
    }
}

function makeListDto(
    opts: {
        status?: OrderListItemResponse["status"]
        shopName?: string | null
        items?: ReturnType<typeof makeItemDto>[]
        /** 后端状态机给的动作（默认待付款的两个：付款 + 取消） */
        availableActions?: OrderAvailableAction[]
    } = {},
): OrderListItemResponse {
    return {
        id: "o-1",
        orderNo: "NO20260906001",
        status: opts.status ?? "PENDING_PAYMENT",
        shopId: "shop-1",
        shopName: "shopName" in opts ? (opts.shopName ?? null) : "测试店",
        availableActions: opts.availableActions ?? ["PAY", "CANCEL"],
        payAmount: MONEY,
        payExpireAt: "2026-09-06T12:00:00Z",
        shipExpireAt: null,
        createdAt: "2026-09-06T11:30:00Z",
        items: opts.items ?? [makeItemDto()],
    }
}

function makeDetailDto(opts: Partial<OrderDetailResponse> = {}): OrderDetailResponse {
    return {
        ...makeListDto(),
        itemAmount: MONEY,
        shippingFee: { amount: 0, currency: "CNY" },
        // 券四件套：默认不用券（减免 0、无券 id）
        discountAmount: { amount: 0, currency: "CNY" },
        userCouponId: null,
        buyerMessage: null,
        receiverName: "张三",
        receiverPhone: "13800000000",
        receiverProvince: "广东省",
        receiverCity: "深圳市",
        receiverDistrict: "南山区",
        receiverDetail: "科技园 1 号",
        logisticsCompany: null,
        trackingNo: null,
        paidAt: null,
        shippedAt: null,
        completedAt: null,
        cancelledAt: null,
        cancelReason: null,
        afterSaleStatus: "NONE",
        refundAmount: MONEY,
        applyExpireAt: null,
        ...opts,
    }
}

describe("toOrder（列表项投影）", () => {
    it("后端 PAID 投影为前端 pending_shipment（履约流无独立已付款段）", () => {
        expect(toOrder(makeListDto({ status: "PAID" })).status).toBe("pending_shipment")
    })

    it("全部 wire 状态映射不串位", () => {
        expect(toOrder(makeListDto({ status: "PENDING_PAYMENT" })).status).toBe("pending_payment")
        expect(toOrder(makeListDto({ status: "SHIPPED" })).status).toBe("pending_receipt")
        expect(toOrder(makeListDto({ status: "COMPLETED" })).status).toBe("completed")
        expect(toOrder(makeListDto({ status: "CANCELLED" })).status).toBe("cancelled")
    })

    it("行项主图 null 归一为 undefined，title 来自 wire 的 name", () => {
        const order = toOrder(makeListDto({ items: [makeItemDto({ image: "img/a.png" })] }))

        expect(order.items[0]).toMatchObject({ title: "测试商品", image: "img/a.png" })
        expect(toOrder(makeListDto()).items[0]?.image).toBeUndefined()
    })

    it("划线价等于成交价 ⇒ 投影成「没有」：卡片上不画那条假折扣删除线", () => {
        expect(
            toOrder(makeListDto({ items: [makeItemDto()] })).items[0]?.originalPrice,
        ).toBeUndefined()
    })

    it("划线价确实更高才留：让过的钱才配一行原价", () => {
        const order = toOrder(
            makeListDto({
                items: [makeItemDto({ originalPrice: { amount: 29900, currency: "CNY" } })],
            }),
        )

        expect(order.items[0]?.originalPrice).toEqual({ amount: 29900, currency: "CNY" })
    })

    it("店铺注销时 shopName 如实透传 null，不造假名", () => {
        expect(toOrder(makeListDto({ shopName: null })).shopName).toBeNull()
    })

    it("金额与时间戳原样透传", () => {
        const dto = makeListDto()

        expect(toOrder(dto)).toMatchObject({
            payAmount: MONEY,
            payExpireAt: "2026-09-06T12:00:00Z",
            createdAt: "2026-09-06T11:30:00Z",
        })
    })

    it("列表契约没有金额四件套_净额只能顶商品额、运费留空（列表页不画明细行）", () => {
        const order = toOrder(makeListDto())

        expect(order.itemAmount).toEqual(MONEY)
        expect(order.shippingFee).toBeUndefined()
    })

    it("可执行动作随之投影：后端给什么就渲染什么（列表页也读后端动作，不按状态另推）", () => {
        const order = toOrder(makeListDto({ status: "PAID", availableActions: ["CANCEL"] }))

        expect(order.availableActions).toEqual(["cancel"])
    })
})

describe("toOrderDetail（详情投影）", () => {
    it("在列表形状之上扩展收货快照与动作集（动作已从 wire 大写投影成领域小写）", () => {
        const detail = toOrderDetail(makeDetailDto())

        expect(detail).toMatchObject({
            receiverName: "张三",
            receiverPhone: "13800000000",
            availableActions: ["pay", "cancel"],
        })
        expect(detail.items).toHaveLength(1)
    })

    it("未发货时物流字段如实透传 null", () => {
        const detail = toOrderDetail(makeDetailDto())

        expect(detail.logisticsCompany).toBeNull()
        expect(detail.trackingNo).toBeNull()
    })

    it("详情四件套覆盖列表口径_商品总价 + 运费 − 优惠 = 实付款（有券也加得起来）", () => {
        const detail = toOrderDetail(
            makeDetailDto({
                itemAmount: { amount: 20000, currency: "CNY" },
                shippingFee: { amount: 1000, currency: "CNY" },
                discountAmount: { amount: 3000, currency: "CNY" },
                payAmount: { amount: 18000, currency: "CNY" },
                userCouponId: "uc-1",
            }),
        )

        expect(detail).toMatchObject({
            itemAmount: { amount: 20000, currency: "CNY" },
            shippingFee: { amount: 1000, currency: "CNY" },
            discountAmount: { amount: 3000, currency: "CNY" },
            payAmount: { amount: 18000, currency: "CNY" },
            userCouponId: "uc-1",
        })
        expect(
            detail.itemAmount.amount + detail.shippingFee.amount - detail.discountAmount.amount,
        ).toBe(detail.payAmount.amount)
    })

    it("没用券的订单_减免为 0 且券 id 为 null（优惠行不出现）", () => {
        const detail = toOrderDetail(makeDetailDto())

        expect(detail.discountAmount.amount).toBe(0)
        expect(detail.userCouponId).toBeNull()
    })

    it("取消原因与取消时间可带回", () => {
        const detail = toOrderDetail(
            makeDetailDto({
                status: "CANCELLED" as OrderDetailResponse["status"],
                cancelledAt: "2026-09-06T11:40:00Z",
                cancelReason: "不想要了",
            }),
        )

        expect(detail.cancelReason).toBe("不想要了")
        expect(detail.cancelledAt).toBe("2026-09-06T11:40:00Z")
    })
})

describe("展示辅助", () => {
    it("每个状态都有中文标签，且取消态不进入进度条（step -1）", () => {
        expect(ORDER_STATUS_LABEL.pending_shipment).toBe("待发货")
        expect(ORDER_STATUS_LABEL.completed).toBe("交易成功")
        expect(ORDER_PROGRESS_STEP.cancelled).toBe(-1)
        expect(ORDER_PROGRESS_STEP.completed).toBe(3)
    })

    it("展示顺序表覆盖全部动作_漏登记的动作用户根本看不见", () => {
        expect([...ORDER_ACTION_ORDER].toSorted()).toEqual(
            Object.keys(ORDER_ACTION_META).toSorted(),
        )
    })
})

describe("toOrderActions（后端动作 → 领域动作）", () => {
    it("三个买家动作各自对位（RECEIVE 在前端叫 confirm）", () => {
        expect(toOrderActions(["PAY"])).toEqual(["pay"])
        expect(toOrderActions(["CANCEL"])).toEqual(["cancel"])
        expect(toOrderActions(["RECEIVE"])).toEqual(["confirm"])
    })

    it("SHIP 是卖方动作_买家投影里丢掉而不是漏进来一个点不动的按钮", () => {
        expect(toOrderActions(["SHIP"])).toEqual([])
    })
})

describe("deriveOrderActions（按钮排 = 后端动作 + 前端附加）", () => {
    const orderOf = (
        status: OrderListItemResponse["status"],
        availableActions: OrderAvailableAction[],
    ) => toOrder(makeListDto({ status, availableActions }))

    it("待发货_只有后端的取消（提醒发货按钮已删：没有消息通道，点了什么都不发生）", () => {
        const items = deriveOrderActions(orderOf("PAID", ["CANCEL"]), "card")

        expect(items.map((i) => i.key)).toEqual(["cancel"])
    })

    it("已发货_查看物流在后端的确认收货之前，且确认收货是主操作", () => {
        const items = deriveOrderActions(orderOf("SHIPPED", ["RECEIVE"]), "card")

        expect(items.map((i) => i.key)).toEqual(["logistics", "confirm"])
        expect(items.find((i) => i.key === "confirm")?.variant).toBe("default")
        expect(items.find((i) => i.key === "logistics")?.variant).toBeUndefined()
    })

    it("终态_后端动作空但卡片与详情页仍各有自己的附加动作", () => {
        expect(deriveOrderActions(orderOf("COMPLETED", []), "card").map((i) => i.key)).toEqual([
            "rebuy",
        ])
        expect(deriveOrderActions(orderOf("COMPLETED", []), "card")[0]?.variant).toBeUndefined()
        expect(deriveOrderActions(orderOf("COMPLETED", []), "detail").map((i) => i.key)).toEqual([
            "rebuy",
            "add_cart",
        ])
        expect(deriveOrderActions(orderOf("COMPLETED", []), "detail")[0]?.variant).toBe("default")
    })

    it("待付款_主操作是去付款，取消只是描边（一屏只一个橙）", () => {
        const items = deriveOrderActions(orderOf("PENDING_PAYMENT", ["PAY", "CANCEL"]), "card")

        expect(items.map((i) => i.key)).toEqual(["pay", "cancel"])
        expect(items.map((i) => i.variant ?? "outline")).toEqual(["default", "outline"])
    })
})
