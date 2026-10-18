package com.shop.platform.aftersale.service;

import com.shop.platform.aftersale.mapper.RefundMapper;
import com.shop.platform.aftersale.model.RefundStatus;
import com.shop.platform.order.api.AfterSaleBadge;
import com.shop.platform.order.api.OrderCommand;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * 售后角标的唯一算法（docs/domain/order-model.md §5.4）：按优先级命中第一个，结果写回订单与主订单的投影列。
 *
 * <p>为什么算法在这里而不是 order 视图里：角标的输入是退款单，而退款单归本模块；order 列表在 order 模块分页，
 * 不能反向查 aftersale 的 schema，所以由「知道真相的一方」算完写回（投影列归展示方，写入归数据方）。
 *
 * <p>两个口径一起给：订单角标供卖家列表/详情，主订单角标供买家订单卡片——同一个算法、不同的扫描范围。
 */
@Component
@RequiredArgsConstructor
public class RefundBadges {

    private final RefundMapper refundMapper;

    private final OrderCommand orderCommand;

    /** 订单角标：有未完结 ⇒ 退款中；否则成功退过商品/运费 ⇒ 已退款；否则成功给过补偿 ⇒ 已补偿 */
    public AfterSaleBadge ofOrder(UUID orderId) {
        if (refundMapper.existsOpenByOrder(orderId, RefundStatus.openStatuses())) {
            return AfterSaleBadge.REFUNDING;
        }
        if (refundMapper.existsSucceededGoodsByOrder(orderId)) {
            return AfterSaleBadge.REFUNDED;
        }
        if (refundMapper.existsSucceededCompensationByOrder(orderId)) {
            return AfterSaleBadge.COMPENSATED;
        }
        return AfterSaleBadge.NONE;
    }

    /** 主订单角标：主订单下任一子订单命中即算，优先级同上 */
    public AfterSaleBadge ofTrade(UUID tradeId) {
        if (refundMapper.existsOpenByTrade(tradeId, RefundStatus.openStatuses())) {
            return AfterSaleBadge.REFUNDING;
        }
        if (refundMapper.existsSucceededGoodsByTrade(tradeId)) {
            return AfterSaleBadge.REFUNDED;
        }
        if (refundMapper.existsSucceededCompensationByTrade(tradeId)) {
            return AfterSaleBadge.COMPENSATED;
        }
        return AfterSaleBadge.NONE;
    }

    /** 算完即写回：退款状态每变一次就调一次，订单侧不缓存旧结论 */
    public void refresh(UUID orderId, UUID tradeId) {
        orderCommand.syncAfterSaleBadge(orderId, tradeId, ofOrder(orderId), ofTrade(tradeId));
    }
}
