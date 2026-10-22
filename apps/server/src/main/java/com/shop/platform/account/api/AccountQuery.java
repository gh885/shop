package com.shop.platform.account.api;

import java.util.Optional;
import java.util.UUID;

/**
 * 买家身份对外的只读点查。
 *
 * <p>trade、payment 都要判断「这单是不是你的」，但它们只该拿到一个 id 和一个状态，
 * 不该拿到手机号或密码哈希——那是 account 自己的事。
 */
public interface AccountQuery {

    /** 买家还在不在用。停用的买家不能下单，但历史订单要能一直指回人。 */
    Optional<BuyerState> find(UUID buyerId);

    /**
     * @param nickname 展示名，只在买家自己的页面用
     * @param active 状态是 active 才为 true。停用买家下单会被拒，但查历史订单仍然允许
     */
    record BuyerState(UUID buyerId, String nickname, boolean active) {}
}
