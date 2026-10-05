import type { ShopMemberItem } from "@shop/api/sdk"

/**
 * shop 域 · 成员：「当前用户是不是这家店的店主」这条判定。
 *
 * 它决定成员页画不画邀请入口与移除按钮（都是能把别人踢出店铺的动作），
 * 所以它必须能脱离渲染被单测钉住：这条判定写错了不会报错，只会静默地把治理入口交给别人。
 *
 * 邀请表单的校验 schema 不在这里：它只服务成员页那一个表单，按「Schema 归属」跟着表单
 * 住在 `routes/_app/shop/member.tsx`（那里直接复用 app-kit 的 `PhoneSchema`）。
 */

/** 判定只吃三列（契约里其余列与它无关），调用方不必交出整行也能问 */
export type MemberIdentity = Pick<ShopMemberItem, "role" | "status" | "userId">

/**
 * 当前用户是否这家店的店主（有成员治理入口）。
 *
 * 三条决定各自挡一种事故：
 * - **比 userId（uuid）而不比 phone**：phone 可空且可变更，拿它当身份会把两个人认成一个人；
 * - **要求 status 为 ACTIVE**：`OWNER` 但还停在 PENDING（邀请未接受）那一行没有行使过店主的权利，
 *   按它放行等于给一个还没进店的账号开治理入口；
 * - **读不到成员列表 / 不知道当前用户是谁 → false**：宁可少给两个按钮。两个入参都缺席时
 *   若照旧比 `undefined === undefined`，页面会在数据到达的那一刻把移除按钮画给任何人。
 */
export function isShopOwner(
    members: readonly MemberIdentity[] | undefined,
    userId: string | undefined,
): boolean {
    if (!userId) return false
    return (members ?? []).some(
        (member) =>
            member.role === "OWNER" && member.status === "ACTIVE" && member.userId === userId,
    )
}
