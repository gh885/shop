package com.shop.platform.order;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.CALLS_REAL_METHODS;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.shop.platform.common.BusinessException;
import com.shop.platform.order.mapper.Order;
import com.shop.platform.order.mapper.OrderMapper;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/**
 * 订单归属闸门（{@link OrderMapper#requireOwned} / {@link OrderMapper#requireShopOwned}）：
 * 不存在与不属于本人给同一句话、同一个状态码（404），不泄露单据存在性。
 *
 * <p>直测 mapper 默认方法而不是经 service：这道门是买卖两侧所有动作的公共入口，收口在此，
 * 回归也钉在此（曾因 isTrue 默认 400 与 AfterSale/ShipmentService 的 404 不一致）。
 */
class OrderMapperTest {

    private final OrderMapper orderMapper = mock(OrderMapper.class, CALLS_REAL_METHODS);

    private final UUID orderId = UUID.randomUUID();

    private Order orderOwnedBy(UUID userId, UUID shopId) {
        Order order = new Order();
        order.setId(orderId);
        order.setUserId(userId);
        order.setShopId(shopId);
        return order;
    }

    @Test
    void 买家侧_非本人订单_与不存在同一句话_404() {
        when(orderMapper.selectById(orderId)).thenReturn(orderOwnedBy(UUID.randomUUID(), UUID.randomUUID()));

        assertThatThrownBy(() -> orderMapper.requireOwned(UUID.randomUUID(), orderId))
                .isInstanceOfSatisfying(BusinessException.class, ex -> {
                    assertThat(ex.getHttpStatus()).isEqualTo(404);
                    assertThat(ex.getDetail()).isEqualTo("订单不存在");
                });
    }

    @Test
    void 买家侧_订单不存在_404() {
        when(orderMapper.selectById(orderId)).thenReturn(null);

        assertThatThrownBy(() -> orderMapper.requireOwned(UUID.randomUUID(), orderId))
                .isInstanceOfSatisfying(BusinessException.class, ex -> assertThat(ex.getHttpStatus())
                        .isEqualTo(404));
    }

    @Test
    void 卖家侧_越店订单_与不存在同一句话_404() {
        when(orderMapper.selectById(orderId)).thenReturn(orderOwnedBy(UUID.randomUUID(), UUID.randomUUID()));

        assertThatThrownBy(() -> orderMapper.requireShopOwned(UUID.randomUUID(), orderId))
                .isInstanceOfSatisfying(BusinessException.class, ex -> {
                    assertThat(ex.getHttpStatus()).isEqualTo(404);
                    assertThat(ex.getDetail()).isEqualTo("订单不存在");
                });
    }

    @Test
    void 归属相符_返回订单本身() {
        UUID userId = UUID.randomUUID();
        Order mine = orderOwnedBy(userId, UUID.randomUUID());
        when(orderMapper.selectById(orderId)).thenReturn(mine);

        assertThat(orderMapper.requireOwned(userId, orderId)).isSameAs(mine);
    }
}
