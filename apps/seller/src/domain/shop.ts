import type { ShopResponse, ShopInviteItemResponse, ShopMemberItemResponse } from "@shop/api/sdk"

/**
 * shop —— 卖家端店铺领域层（纯类型 + wire → 投影，不碰 React / 网络）。
 * wire 字段全可选，投影归一为稳定领域形状。
 */

// ---------- 状态（字面量联合，与后端 Shop.status 枚举对齐） ----------

/** 店铺状态：PENDING_REVIEW 待审核 / ACTIVE 正常 / REJECTED 拒绝 / DISABLED 封禁 */
export type ShopStatus = "PENDING_REVIEW" | "ACTIVE" | "REJECTED" | "DISABLED"

/** 店铺成员角色 */
export type ShopRole = "OWNER" | "MEMBER"

/** 成员加入状态 */
export type MemberStatus = "PENDING" | "ACTIVE"

// ---------- 域类型（非空） ----------

/** 店铺：logoKey 可空 */
export type Shop = {
    id: string
    ownerId: string
    name: string
    logoKey: string | null
    status: ShopStatus
    createdAt: string
    updatedAt: string
}

/** 待确认邀请（我的视角）：shopName 可空（可能查不到店名） */
export type ShopInviteItem = {
    memberId: string
    shopId: string
    shopName: string | null
    createdAt: string
}

/** 店铺成员（店主视角）：phone 可空；permissions 为被授予码（OWNER 空集） */
export type ShopMemberItem = {
    memberId: string
    userId: string
    phone: string | null
    role: ShopRole
    status: MemberStatus
    permissions: string[]
}

// ---------- wire → 投影 ----------

function toShopStatus(s: string): ShopStatus {
    return s === "ACTIVE" || s === "PENDING_REVIEW" || s === "REJECTED" || s === "DISABLED"
        ? s
        : "PENDING_REVIEW"
}

export function toShop(dto: ShopResponse): Shop {
    return {
        id: dto.id ?? "",
        ownerId: dto.ownerId ?? "",
        name: dto.name ?? "",
        logoKey: dto.logoKey ?? null,
        status: toShopStatus(dto.status ?? "PENDING_REVIEW"),
        createdAt: dto.createdAt ?? "",
        updatedAt: dto.updatedAt ?? "",
    }
}

export function toShopInviteItem(dto: ShopInviteItemResponse): ShopInviteItem {
    return {
        memberId: dto.memberId ?? "",
        shopId: dto.shopId ?? "",
        shopName: dto.shopName ?? null,
        createdAt: dto.createdAt ?? "",
    }
}

export function toShopMemberItem(dto: ShopMemberItemResponse): ShopMemberItem {
    return {
        memberId: dto.memberId ?? "",
        userId: dto.userId ?? "",
        phone: dto.phone ?? null,
        role: dto.role === "OWNER" ? "OWNER" : "MEMBER",
        status: dto.status === "ACTIVE" ? "ACTIVE" : "PENDING",
        permissions: dto.permissions ?? [],
    }
}
