import type { MeResponse } from "@shop/api/sdk"

/**
 * user —— 当前登录用户领域层（纯类型 + wire → 投影，不碰 React / 网络）。
 *
 * 投影刻意做瘦：只暴露消费方真正需要的字段（id/phone/nickname/avatarKey），
 * 不把后端 MeResponse 整个铺开。契约字段均可选，toCurrentUser 归一成稳定缺省形状，
 * 下游组件无需再判空。
 */

export type CurrentUser = {
    id: string
    phone: string
    nickname: string
    avatarKey?: string
}

/** wire → 投影：字段归一成稳定缺省形状 */
export function toCurrentUser(dto: MeResponse): CurrentUser {
    return {
        id: dto.id ?? "",
        phone: dto.phone ?? "",
        nickname: dto.nickname ?? "",
        avatarKey: dto.avatarKey,
    }
}
