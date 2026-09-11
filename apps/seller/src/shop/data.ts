import { ShopsApi } from "@shop/api/sdk"

import { type ShopResponse, type ShopInviteItem, type ShopMemberItem } from "@shop/api/sdk"

// ---------- 店铺域数据函数（直接在调用点用，不经集中封装对象） ----------

/** 我的店铺列表：wire → 领域形状 */
export async function myShops(): Promise<ShopResponse[]> {
    return ShopsApi.listMyShops()
}

/** 待确认邀请（我的视角）：wire → 领域形状 */
export async function myInvites(): Promise<ShopInviteItem[]> {
    return ShopsApi.listShopInvites()
}

/** 接受加入邀请 */
export async function acceptInvite(memberId: string) {
    await ShopsApi.acceptShopInvite({ path: { memberId } })
}

/** 开新店（提交 PENDING_REVIEW） */
export async function createShop(input: { name: string }) {
    await ShopsApi.createShop({ body: { name: input.name } })
}

/** 店铺成员列表（店主视角，含手机号与权限）：wire → 领域形状 */
export async function shopMembers(shopId: string): Promise<ShopMemberItem[]> {
    return ShopsApi.listShopMembers({ path: { shopId } })
}

/** 邀请成员入店 */
export async function inviteMember(shopId: string, input: { phone: string }) {
    await ShopsApi.inviteShopMember({ path: { shopId }, body: { phone: input.phone } })
}

/** 移除成员 */
export async function removeMember(shopId: string, memberId: string) {
    await ShopsApi.removeShopMember({ path: { shopId, memberId } })
}
