package com.shop.platform.coupon.api;

import com.shop.platform.coupon.mapper.UserCouponMapper;
import com.shop.platform.coupon.service.CouponEvaluator;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * 券只读查询（跨模块消费）：order 结算时按店问「这位买家在本店能用哪些券、各减多少、不能用是为什么」。
 *
 * <p>刻意不提供的能力：写、以及「按任意条件查券」——越界查询无处可写。券的核销动作在 {@link CouponCommand}。
 *
 * <p>范围口径：一期券范围 = 本店全部商品，所以 base 就是该店的<b>商品小计</b>（order 分组算钱时已算好），
 * 不含运费、不含其他优惠（平行优惠，见 CouponEvaluator）。
 */
@Component
@RequiredArgsConstructor
public class CouponReadQuery {

    private final UserCouponMapper userCouponMapper;

    private final CouponEvaluator evaluator;

    /**
     * 本店可用券评估：返回<b>全部未使用券</b>的评估结果（含不可用者的原因码），已按结算页默认次序排好
     * （可用在前、优惠大的在前、同额快到期的在前）。
     *
     * @param itemAmountFen 本店商品小计（分），不含运费 —— 门槛判定的基数
     * @param currency 本单币种：与券币种不一致判不可用，不做汇率换算
     */
    public List<CouponAvailabilityView> evaluateForShop(UUID userId, UUID shopId, long itemAmountFen, String currency) {
        return evaluator.evaluate(
                userCouponMapper.selectUnusedInShop(userId, shopId), itemAmountFen, currency, OffsetDateTime.now());
    }
}
