import { z } from "zod"

// ---------- 店铺 ----------

/** 店铺状态：PENDING_REVIEW 待审核 / ACTIVE 正常 / REJECTED 拒绝 / DISABLED 封禁 */
export const ShopStatusSchema = z.enum(["PENDING_REVIEW", "ACTIVE", "REJECTED", "DISABLED"])
export type ShopStatus = z.infer<typeof ShopStatusSchema>

export const ShopSchema = z.object({
    id: z.uuid(),
    ownerId: z.uuid(),
    name: z.string(),
    logoKey: z.string().nullable(),
    status: ShopStatusSchema,
    createdAt: z.string(),
    updatedAt: z.string(),
})
export type Shop = z.infer<typeof ShopSchema>

/** 店铺成员（invite / accept 返回实体）；permissions 为被授予码（OWNER 空集，全权由角色判定） */
export const ShopMemberSchema = z.object({
    id: z.uuid(),
    shopId: z.uuid(),
    userId: z.uuid(),
    role: z.enum(["OWNER", "MEMBER"]),
    status: z.enum(["PENDING", "ACTIVE"]),
    permissions: z.array(z.string()),
    createdAt: z.string(),
    updatedAt: z.string(),
})
export type ShopMember = z.infer<typeof ShopMemberSchema>

/** 待确认邀请（我的视角） */
export const ShopInviteItemSchema = z.object({
    memberId: z.uuid(),
    shopId: z.uuid(),
    shopName: z.string().nullable(),
    createdAt: z.string(),
})
export type ShopInviteItem = z.infer<typeof ShopInviteItemSchema>

/** 店铺成员（店主视角，含手机号与被授予码）；OWNER 的 permissions 恒为空集 */
export const ShopMemberItemSchema = z.object({
    memberId: z.uuid(),
    userId: z.uuid(),
    phone: z.string().nullable(),
    role: z.enum(["OWNER", "MEMBER"]),
    status: z.enum(["PENDING", "ACTIVE"]),
    permissions: z.array(z.string()),
})
export type ShopMemberItem = z.infer<typeof ShopMemberItemSchema>

// ---------- 请求 ----------

export const CreateShopRequestSchema = z.object({
    name: z.string().trim().min(1, "请输入店铺名称").max(50, "店名最长 50 字"),
    logoKey: z.string().max(255).optional(),
})
export type CreateShopRequest = z.infer<typeof CreateShopRequestSchema>

/** 可授予子账号的权限码（服务端白名单见后端 SellerGrants，两端同步） */
export const SellerGrantCodes = ["PRODUCT_MANAGE", "ORDER_FULFILL"] as const

export const InviteMemberRequestSchema = z.object({
    phone: z.string().regex(/^1\d{10}$/, "请输入正确的手机号"),
    permissions: z.array(z.enum(SellerGrantCodes)).optional(),
})
export type InviteMemberRequest = z.infer<typeof InviteMemberRequestSchema>

/** 店主调整子账号权限（全量替换；空数组 = 清空全部权限） */
export const UpdateMemberPermissionsRequestSchema = z.object({
    permissions: z.array(z.enum(SellerGrantCodes)),
})
export type UpdateMemberPermissionsRequest = z.infer<typeof UpdateMemberPermissionsRequestSchema>
