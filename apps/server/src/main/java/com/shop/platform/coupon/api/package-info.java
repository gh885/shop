/**
 * Coupon 模块对外命名接口：只读查询（{@code CouponReadQuery}：order 结算时问「这批行能用哪些券、各减多少」）
 * 与券命令（{@code CouponCommand}：order 下单占用 / 支付核销 / 取消释放，aftersale 退款退券）。
 *
 * <p>两边都是<b>同事务同步调用</b>语义：下单占用抢不到就抛 409 让整笔下单回滚，支付核销失败令支付事务回滚——
 * 券与订单/资金要么一起成立要么一起不成（见 apps/server/AGENTS.md「api 命令只用于同事务原子」）。
 *
 * <p>可用性是<b>可解释的</b>：{@code CouponAvailabilityView} 带不可用原因码，结算页据此告诉用户「为什么不能用」，
 * 而不是只回一个 boolean。{@code CouponUnavailableReason} 与 {@code CouponBearer} 也归本包——原因码是对前端的契约、
 * 承担方要落订单快照并供将来的结算拆账，都是跨模块词汇（券内部的状态词表则留在 model 包，不外泄）。
 */
@org.springframework.modulith.NamedInterface("api")
package com.shop.platform.coupon.api;
