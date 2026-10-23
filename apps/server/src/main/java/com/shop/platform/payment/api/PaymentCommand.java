package com.shop.platform.payment.api;

import java.time.Instant;
import java.util.UUID;

/**
 * 支付对外的同步命令。
 *
 * <p>回调**不是**这里的方法：它由渠道 POST 进来，走 controller。这里只管"发起支付"和"主动查单"。
 *
 * <p><b>金额由调用方传，不由 payment 自己查。</b> 这条看起来违反"金额不许外部传"，但方向要看清：
 * 传金额的是 {@code trade}（订单的持有者，它自己算的应付金额），不是买家。
 * 买家侧入口在 {@code trade}，那里只收 {@code orderGroupId}。
 *
 * <p>为什么这么绕：{@code payment} 一旦回查 {@code trade} 读金额，两个模块就成环——
 * {@code payment → trade.api} 加上 {@code trade → payment.events} 是个真环。
 * 而环一旦存在，两个模块就再也分不开了。所以把"算金额"留在 trade，"收钱"留给 payment，
 * 依赖方向单向：{@code trade → payment :: api}。
 */
public interface PaymentCommand {

    /**
     * 发起支付。
     *
     * <p>同一订单组已有未过期的 pending 支付单时复用，不新建：用户反复点"去支付"不该堆出一串支付单。
     *
     * @param orderGroupId 订单组。仅作关联键，payment 不据此回查订单
     * @param buyerId 付款人。payment 校验支付单归属时用
     * @param amount 应付金额（分）。由 trade 算好传入，payment 不做任何金额推导
     * @param currency 币种
     * @param payableUntil 订单侧可付期限（订单 expireAt + 关单宽限），由 trade 传入。
     *     支付单有效期取「自身 TTL」与它的较早者——支付单不能比订单可付窗口活得久，
     *     否则用户第 29 分才点支付，支付单活到第 59 分，渠道还在收一笔永远推进不了订单的钱
     */
    PaymentView create(UUID orderGroupId, UUID buyerId, long amount, String currency, Instant payableUntil);

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
     * 原路退款。由售后在确认退款时同步调用。
     *
     * <p>为什么是命令不是事件：{@code payment} 若订阅 {@code returns} 的事件，依赖会变成
     * {@code payment → returns → trade → payment}，一个真环。命令的方向是
     * {@code returns → payment}，与 {@code trade → payment} 同向。
     *
     * <p>幂等键是 {@code (payment_id, seller_order_id, reason)}；重复调用返回同一张退款单。
     *
     * @param reason 上游业务单号（现在是售后单 id），退款单的唯一键成分
     * @return {@code success=false} 表示渠道没受理，钱没出去——调用方不能把售后单推进到完成
     */
    Refund refund(UUID orderGroupId, UUID sellerOrderId, long amount, String currency, String reason);

    /**
     * 挂账：钱到了但订单推进不了，登记一条待查记录。给 trade 在 markPaid 输给超时关单后调。
     *
     * <p>幂等：同一支付单同一原因只挂一条（唯一索引兜底）。
     *
     * @param arrivedAmount 实际到账金额（分）
     */
    void suspend(UUID paymentId, long arrivedAmount, String currency, SuspenseReason reason);

    /** 一次退款的结果。 */
    record Refund(UUID refundId, boolean success) {}

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
