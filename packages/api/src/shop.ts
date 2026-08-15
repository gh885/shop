import type { KyInstance } from 'ky';

import {
    ShopInviteItemSchema,
    ShopMemberItemSchema,
    ShopMemberSchema,
    ShopSchema,
    type CreateShopRequest,
    type InviteMemberRequest,
    type Shop,
    type ShopInviteItem,
    type ShopMember,
    type ShopMemberItem,
} from './schemas/shop';
import { z } from 'zod';

export function createShopApi(api: KyInstance) {
    return {
        /** 开店：创建店铺，落 PENDING_REVIEW 待平台审核 */
        async createShop(data: CreateShopRequest): Promise<Shop> {
            return ShopSchema.parse(await api.post('shops', { json: data }).json());
        },

        /** 我的店铺列表（ACTIVE 成员身份） */
        async myShops(): Promise<Shop[]> {
            return z.array(ShopSchema).parse(await api.get('shops/mine').json());
        },

        /** 我的待确认邀请 */
        async myInvites(): Promise<ShopInviteItem[]> {
            return z.array(ShopInviteItemSchema).parse(await api.get('shops/invites').json());
        },

        /** 同意邀请 */
        async acceptInvite(memberId: string): Promise<ShopMember> {
            return ShopMemberSchema.parse(
                await api.post(`shops/invites/${memberId}/accept`).json(),
            );
        },

        /** 店铺成员列表（本店成员可见） */
        async members(shopId: string): Promise<ShopMemberItem[]> {
            return z
                .array(ShopMemberItemSchema)
                .parse(await api.get(`shops/${shopId}/members`).json());
        },

        /** 店主按手机号邀请成员 */
        async invite(shopId: string, data: InviteMemberRequest): Promise<ShopMember> {
            return ShopMemberSchema.parse(
                await api.post(`shops/${shopId}/invites`, { json: data }).json(),
            );
        },

        /** 店主移除成员 */
        async removeMember(shopId: string, memberId: string): Promise<void> {
            await api.delete(`shops/${shopId}/members/${memberId}`);
        },
    };
}
