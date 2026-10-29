package com.shop.platform.seller.api;

import java.util.UUID;

/**
 * 入驻审核结论的回写命令。governance 在审核事务里调用：它对 seller_profile 做 CAS，
 * 这里同步把入驻申请单翻到终态——一次决策两个模块各写各的表，同一事务原子生效。
 *
 * <p>为什么不走事件：seller 侧入驻状态是卖家端的重提闸门与展示口径，允许它晚到（最终一致）
 * 就会出现「管理员通过了、卖家还看不到、重提还报错」的窗口。同事务命令没有窗口。
 */
public interface OnboardingCommand {

    /** 审核通过：申请单 pending → approved。 */
    void approve(UUID merchantId);

    /** 审核驳回：申请单 pending → rejected，理由落进申请单，卖家端据此改材料。 */
    void reject(UUID merchantId, String reason);
}
