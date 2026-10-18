package com.shop.platform.logistics.api;

import com.shop.platform.logistics.mapper.Shipment;
import com.shop.platform.logistics.mapper.ShipmentMapper;
import com.shop.platform.logistics.model.ShipmentStatus;
import com.shop.platform.order.api.OrderFulfillmentFacts;
import java.time.OffsetDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * 发货事实只读查询（跨模块消费）：把「这个订单有没有发过货、未取消的包裹是否全部签收」折成三个结论。
 *
 * <p>为什么 aftersale 需要它：退款成功要改变结清量，履约态必须按事实重算（§8），而重算的输入
 * （{@link OrderFulfillmentFacts}）只有本模块答得出来——已取消的包裹不算、逆向回寄不算、
 * 一单多包裹时「全部签收」也不是订单上某一列能直接读的。让 aftersale 自己拼这几条会在模块边界外重建物流规则，
 * 故与 logistics 自己的重算共用同一个出口。
 *
 * <p>方向仍是单向：aftersale → logistics::api；本模块不认识退款单。
 */
@Component
@RequiredArgsConstructor
public class ShipmentFactsQuery {

    private final ShipmentMapper shipmentMapper;

    /** 正向包裹（不含逆向回寄）的履约事实；没有包裹时按「没发过、没签收过」返回 */
    public OrderFulfillmentFacts forwardFacts(UUID orderId) {
        List<Shipment> active = shipmentMapper.selectForwardByOrder(orderId).stream()
                .filter(s -> s.getStatus() != ShipmentStatus.CANCELLED)
                .toList();
        boolean hasEverShipped = active.stream().anyMatch(s -> s.getShippedAt() != null);
        boolean allDelivered =
                !active.isEmpty() && active.stream().allMatch(s -> s.getStatus() == ShipmentStatus.DELIVERED);
        OffsetDateTime lastDeliveredAt = allDelivered
                ? active.stream()
                        .map(Shipment::getSignedAt)
                        .filter(Objects::nonNull)
                        .max(Comparator.naturalOrder())
                        .orElse(null)
                : null;
        return new OrderFulfillmentFacts(hasEverShipped, allDelivered, lastDeliveredAt);
    }
}
