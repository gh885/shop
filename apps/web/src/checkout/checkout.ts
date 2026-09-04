import type { Money } from "@shop/api"
import type { Money as SdkMoney, PreviewResponse } from "@shop/api/sdk"

/** 归一：SDK 的 Money 现已 required 且非 null，原样透传 */
function toMoney(m: SdkMoney): Money {
    return { amount: m.amount, currency: m.currency }
}

/** wire → 领域：只做形状归一（field 透传 + Money），不造假默认值。 */
export function toCheckoutPreview(dto: PreviewResponse): CheckoutPreview {
    return {
        groups: dto.groups.map((g) => ({
            shopId: g.shopId,
            shopName: g.shopName,
            lines: g.lines.map((l) => ({
                skuId: l.skuId,
                productId: l.productId,
                name: l.name,
                image: l.image ?? undefined,
                price: toMoney(l.price),
                originalPrice: toMoney(l.originalPrice),
                quantity: l.quantity,
                stock: l.stock,
            })),
            itemAmount: toMoney(g.itemAmount),
            shippingFee: toMoney(g.shippingFee),
            payAmount: toMoney(g.payAmount),
        })),
        unavailable: dto.unavailable.map((u) => ({
            skuId: u.skuId,
            name: u.name,
            image: u.image ?? undefined,
            quantity: u.quantity,
            cause: u.cause,
        })),
        address: {
            id: dto.address.id,
            receiverName: dto.address.receiverName,
            receiverPhone: dto.address.receiverPhone,
            province: dto.address.province,
            city: dto.address.city,
            district: dto.address.district,
            detail: dto.address.detail,
        },
        totalPayAmount: toMoney(dto.totalPayAmount),
    }
}

/** 结算预览业务形状：按店分组明细 + 失效行置灰 + 地址回显可选 + 应付总额 */
export type CheckoutPreview = {
    /** 按店拆单预告（每店一组，含行明细/商品额/运费/应付） */
    groups: CheckoutGroup[]
    /** 失效行（售罄/下架），前端置灰不可选 */
    unavailable: UnavailableLine[]
    /** 回显的地址（后端默认取默认地址；未选返回 undefined，前端持列表自行选） */
    address?: CheckoutAddress
    /** 全部应付总额 */
    totalPayAmount: Money
}

type CheckoutGroup = {
    shopId: string
    shopName: string
    lines: CheckoutLine[]
    itemAmount: Money
    shippingFee: Money
    payAmount: Money
}

type CheckoutLine = {
    skuId: string
    productId: string
    name: string
    /** 主图（SDK 可空，UI 用占位图） */
    image?: string
    price: Money
    originalPrice: Money
    quantity: number
    stock: number
}

type UnavailableLine = {
    skuId: string
    name: string
    /** 主图（SDK 可空） */
    image?: string
    quantity: number
    cause: string
}

type CheckoutAddress = {
    id: string
    receiverName: string
    receiverPhone: string
    province: string
    city: string
    district: string
    detail: string
}
