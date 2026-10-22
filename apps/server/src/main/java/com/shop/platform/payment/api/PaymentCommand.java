package com.shop.platform.payment.api;

import java.util.UUID;

/**
 * 支付对外的同步命令。
 *
 * <p>回调**不是**这里的方法：它由渠道 POST 进来，走 controller。这里只管"发起支付"和"主动查单"。
 */
public interface PaymentCommand {

    /**
     * 发起支付。应付金额从 {@code trade} 读，**调用方不许传**——传了就能编一个金额去付。
     *
     * <p>同一订单组已有 pending 支付单时复用，不新建：用户反复点"去支付"不该堆出一串支付单。
     */
    PaymentView create(UUID orderGroupId, UUID buyerId);

    /**
     * 主动查单。用户说付了但回调没来时的唯一出路。
     *
     * <p>带 {@code buyerId} 是必须的：不带的话任何登录用户都能拿别人的支付单 id 去查，
     * 而查单会推进状态——那就成了"帮别人确认收款"。归属在 service 里校验。
     *
     * @return 查单结果
     */
    Confirmation confirm(UUID paymentId, UUID buyerId);

    /**
     * 一次确认的结果。
     *
     * <p>{@code paid} 和 {@code applied} 是两件事，别合并：
     *
     * <ul>
     *   <li>{@code paid}：这张支付单现在是不是"钱到了"。重复确认、金额不符都可能是 true
     *   <li>{@code applied}：<b>这一次请求</b>有没有推进状态。重复确认是 false——
     *       调用方要据此知道"我刚才那次点击其实什么都没干"
     * </ul>
     *
     * <p>合并成一个 boolean 的话，第二次确认会返回 true，前端就会以为是自己这次付成功的。
     */
    record Confirmation(UUID paymentId, boolean paid, boolean applied, String message) {}
}
