package com.shop.platform.coupon.service;

import com.shop.platform.coupon.mapper.CouponTemplate;

/**
 * 卖家视角的一行券 —— 模板 + <b>已核销数</b>。
 *
 * <p>「已发放」是模板行上的计数（`issued_quantity`：领出去多少张），「已核销」是 user_coupons 里的实际核销
 * （真的被订单用掉多少张）。两者差额 = <b>发了但没用掉</b>——这是卖家最想知道的一格：
 * 券到底带来了订单，还是只是被领走了（券发得多、用不掉，等于在券包里养僵尸券）。
 *
 * <p>刻意分开两个字段而不是只给一个"核销率"：前端要显示绝对数与进度，比率还原不回绝对数。
 */
public record ShopCoupon(CouponTemplate template, long usedQuantity) {}
