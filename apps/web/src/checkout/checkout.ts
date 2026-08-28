import type { Money } from "@shop/api"
import type { Money as SdkMoney, PreviewResponse } from "@shop/api/sdk"

/** checkout —— 结算预览领域层（纯类型 + wire → 投影，不碰 React / 网络）。
 * 结算规则（拆单/金额/失效判定）由后端裁决，这里只做 wire → 业务形状归一。 */

/** 归一：SDK 的 Money 可选 → 业务必填 */
function toMoney(m: SdkMoney | null | undefined): Money | null {
    if (m == null) return null
    return { amount: m.amount ?? 0, currency: m.currency ?? "CNY" }
}

/** 结算预览业务形状：按店分组明细 + 失效行置灰 + 地址回显可选 + 应付总额 */
export type CheckoutPreview = {
    /** 按店拆单预告（每店一组，含行明细/商品额/运费/应付） */
    groups: CheckoutGroup[]
    /** 失效行（售罄/下架），前端置灰不可选 */
    unavailable: UnavailableLine[]
    /** 回显的地址（后端默认取默认地址；未选返回 null，前端持列表自行选） */
    address: CheckoutAddress | null
    /** 全部应付总额 */
    totalPayAmount: Money
}

export type CheckoutGroup = {
    shopId: string
    shopName: string
    lines: CheckoutLine[]
    itemAmount: Money
    shippingFee: Money
    payAmount: Money
}

export type CheckoutLine = {
    skuId: string
    productId: string
    name: string
    image: string
    price: Money
    originalPrice: Money | null
    quantity: number
    stock: number
}

export type UnavailableLine = {
    skuId: string
    name: string
    image: string
    quantity: number
    cause: string
}

export type CheckoutAddress = {
    id: string
    receiverName: string
    receiverPhone: string
    province: string
    city: string
    district: string
    detail: string
}

/** wire → 投影 */
export function toCheckoutPreview(dto: PreviewResponse): CheckoutPreview {
    return {
        groups: (dto.groups ?? []).map((g) => ({
            shopId: g.shopId ?? "",
            shopName: g.shopName ?? "",
            lines: (g.lines ?? []).map((l) => ({
                skuId: l.skuId ?? "",
                productId: l.productId ?? "",
                name: l.name ?? "",
                image: l.image ?? "",
                price: toMoney(l.price) ?? { amount: 0, currency: "CNY" },
                originalPrice: toMoney(l.originalPrice),
                quantity: l.quantity ?? 0,
                stock: l.stock ?? 0,
            })),
            itemAmount: toMoney(g.itemAmount) ?? { amount: 0, currency: "CNY" },
            shippingFee: toMoney(g.shippingFee) ?? { amount: 0, currency: "CNY" },
            payAmount: toMoney(g.payAmount) ?? { amount: 0, currency: "CNY" },
        })),
        unavailable: (dto.unavailable ?? []).map((u) => ({
            skuId: u.skuId ?? "",
            name: u.name ?? "",
            image: u.image ?? "",
            quantity: u.quantity ?? 0,
            cause: u.cause ?? "",
        })),
        address: dto.address
            ? {
                  id: dto.address.id ?? "",
                  receiverName: dto.address.receiverName ?? "",
                  receiverPhone: dto.address.receiverPhone ?? "",
                  province: dto.address.province ?? "",
                  city: dto.address.city ?? "",
                  district: dto.address.district ?? "",
                  detail: dto.address.detail ?? "",
              }
            : null,
        totalPayAmount: toMoney(dto.totalPayAmount) ?? { amount: 0, currency: "CNY" },
    }
}
