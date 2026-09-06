import { type Money } from "@shop/api"
import type {
    Address,
    Group,
    Item,
    PreviewResponse,
    UnavailableLine as SdkUnavailableLine,
} from "@shop/api/sdk"

/** 行明细：契约同 SDK Item，仅主图归一（SDK 可空 null，UI 用占位图 → undefined） */
export type CheckoutLine = Omit<Item, "image"> & { image?: string }

/** 按店分组：契约同 SDK Group，行明细换成本地归一后的 CheckoutLine */
export type CheckoutGroup = Omit<Group, "lines"> & { lines: CheckoutLine[] }

/** 失效行：契约同 SDK UnavailableLine，仅主图归一 */
export type UnavailableLine = Omit<SdkUnavailableLine, "image"> & { image?: string }

/** 结算预览业务形状：按店分组明细 + 失效行置灰 + 地址回显可选 + 应付总额 */
export type CheckoutPreview = {
    /** 按店拆单预告（每店一组，含行明细/商品额/运费/应付） */
    groups: CheckoutGroup[]
    /** 失效行（售罄/下架），前端置灰不可选 */
    unavailable: UnavailableLine[]
    /** 回显的地址（后端默认取默认地址，前端持列表自行选） */
    address?: Address
    /** 全部应付总额 */
    totalPayAmount: Money
}

/** wire → 领域：只做形状归一（image null→undefined），不造假默认值。 */
export function toCheckoutPreview(dto: PreviewResponse): CheckoutPreview {
    return {
        groups: dto.groups.map((g) => ({
            ...g,
            lines: g.lines.map((l) => ({ ...l, image: l.image ?? undefined })),
        })),
        unavailable: dto.unavailable.map((u) => ({ ...u, image: u.image ?? undefined })),
        address: dto.address,
        totalPayAmount: dto.totalPayAmount,
    }
}
