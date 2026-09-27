/**
 * Review 模块 —— 商品评价：已完成订单按订单行评价（星级 + 文字 + 图），一单一评不可改、可追评一次，卖家可回复一次。
 *
 * <p>schema: review。两张表：{@code review.reviews}（评价主体，一单一评，含追评与回复两个可空列）与
 * {@code review.review_items}（逐订单行的评分行）。append-only：没有 update 评价本身的入口。
 *
 * <p>依赖方向单向：order :: api 给「归属、状态、完成时刻、行快照」（评价窗口 30 天是本域规则，落在
 * {@code review.service.ReviewWindows}）；account :: api 给买家昵称（出参一律经 {@code Nickname.mask}）。
 * 商品与店铺信息不反查：评价行自己带商品快照，店铺归属从订单带过来——评价是「当时那件商品」与「那家店」的合影。
 *
 * <p>评价不进平台操作审计账本（audit :: api）：买家与卖家之间的内容往来不是平台治理动作（REV-17）。
 */
@ApplicationModule(
        displayName = "Review",
        allowedDependencies = {"order :: api", "account :: api"})
package com.shop.platform.review;

import org.springframework.modulith.ApplicationModule;
