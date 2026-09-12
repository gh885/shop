/**
 * Coupon 模块 — 优惠券（营销域）：券模板（运营配置的规则）+ 用户券（领取后的实例）+ 核销流水
 *
 * <p>schema: coupon。设计与取舍见 docs/decisions/coupon.md。
 * 模板与实例分离：规则在模板，用户券在领取时把券名/面额/门槛/有效期固化成绝对值——运营改配置不影响已发出的券。
 * 一期只有店铺券（范围 = 本店全部商品，与 order 的「按店拆单」天然对齐，零分摊）与「满 X 减 Y」一种玩法。
 *
 * <p>对外只有一条路：order 结算时经 coupon :: api 问「这批行能用哪些券、各减多少」（可用性判定是可解释的，
 * 带不可用原因码），下单同事务锁定、支付核销、取消释放；aftersale 退款完成时退券。
 * 券不反向依赖 order —— 流水里的 order_id 是裸引用不加 FK，方向永远朝 order 单向。
 */
@ApplicationModule(
        displayName = "Coupon",
        allowedDependencies = {"shop :: api"})
package com.shop.platform.coupon;

import org.springframework.modulith.ApplicationModule;
