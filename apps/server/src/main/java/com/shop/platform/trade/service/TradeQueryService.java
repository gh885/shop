package com.shop.platform.trade.service;

import com.shop.platform.trade.api.TradeQuery;
import com.shop.platform.trade.mapper.OrderGroupStore;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Component;

/** {@link TradeQuery} 的实现。只读，不开事务。 */
@Component
public class TradeQueryService implements TradeQuery {

    private final OrderGroupStore groups;

    public TradeQueryService(OrderGroupStore groups) {
        this.groups = Objects.requireNonNull(groups, "groups");
    }

    @Override
    public Optional<Payable> findPayable(UUID orderGroupId) {
        return groups.find(orderGroupId)
                .map(group -> new Payable(
                        group.id(),
                        group.buyerId(),
                        group.payableAmount(),
                        group.currency(),
                        // 还能付：未付款、未关闭、未过期。三个条件缺一不可
                        group.paymentStatus() == com.shop.platform.trade.model.PaymentStatus.UNPAID
                                && group.isOpen()
                                && group.expireAt().isAfter(java.time.Instant.now()),
                        group.paymentStatus().hasMoney()));
    }
}
