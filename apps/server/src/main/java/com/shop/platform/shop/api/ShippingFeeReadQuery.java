package com.shop.platform.shop.api;

import com.shop.platform.common.Money;
import com.shop.platform.common.Validate;
import com.shop.platform.shop.service.ShippingFeeCalculator;
import com.shop.platform.shop.service.ShippingTemplateService;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * 运费报价查询（跨模块消费，经 shop :: api）——order 结算的唯一运费入口。
 *
 * <p>为什么报价在 shop 而不是 order：模板、规则、区域都是本模块的数据，<b>「怎么算」属于模板的拥有者</b>；
 * order 只提供订单侧的事实（收货区码、同店合计件数与商品额）并消费结果。若把算盘放 order，
 * order 就得认识 prefix 语义、默认规则、包邮门槛三套本模块的领域知识。
 *
 * <p>只读：不写任何表，也不碰 cart/product/account（那些事实由 order 装配后传进来）。
 * 运费口径是「同店合计」而不是「按行」——一次结算已按店拆单，一个订单恰好一个模板一份运费。
 */
@Component
@RequiredArgsConstructor
public class ShippingFeeReadQuery {

    private final ShippingTemplateService shippingTemplateService;

    private final ShippingFeeCalculator shippingFeeCalculator;

    /**
     * 报价：按收货区码 + 同店合计件数/商品额算出这笔订单的运费。
     *
     * <p>未配置模板 → 恒包邮（templateId 为 null）：模板是上线后新增的能力，历史店铺没有模板，
     * 若在这里拒绝下单等于把存量店铺全部锁死。
     *
     * @param regionCode 收货地址的国标区划码（6 位），计费比对的键；缺失即 400（无地址不算运费）
     * @param itemAmount 同店商品总额（不含运费自身），满额包邮门槛的判定基数
     */
    public ShippingQuote quote(UUID shopId, String regionCode, int totalQuantity, Money itemAmount) {
        Validate.isTrue(regionCode != null && !regionCode.isBlank(), "收货地区不能为空");
        return shippingTemplateService
                .findPricing(shopId)
                .map(pricing -> shippingFeeCalculator.quote(pricing, regionCode, totalQuantity, itemAmount))
                .orElseGet(() -> new ShippingQuote(null, true, Money.ofFen(0, itemAmount.currency())));
    }
}
