package com.shop.platform.order.service;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

import com.shop.platform.address.api.MerchantAddressReadQuery;
import com.shop.platform.common.BusinessException;
import com.shop.platform.inventory.api.StockCommand;
import com.shop.platform.order.dto.ShipOrderRequest;
import com.shop.platform.order.mapper.OrderItemMapper;
import com.shop.platform.order.mapper.OrderMapper;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;

/**
 * 订单履约转移单测（针对发货边界）：发货依赖「本店默认发货地址」，无默认即拒绝（发货无寄件人硬失败）。
 *
 * <p>地址快照供给经 address::api，是本单测 mock 的边界——不断言快照内容，只断言「无默认 → 发货被拒」。
 */
@ExtendWith(MockitoExtension.class)
class OrderTransitionServiceTest {

    private final UUID shopId = UUID.randomUUID();

    @Mock
    private OrderMapper orderMapper;

    @Mock
    private OrderItemMapper orderItemMapper;

    @Mock
    private StockCommand stockCommand;

    @Mock
    private OrderStatusLogWriter statusLogWriter;

    @Mock
    private ApplicationEventPublisher events;

    @Mock
    private MerchantAddressReadQuery merchantAddressReadQuery;

    @InjectMocks
    private OrderTransitionService orderTransitionService;

    @Test
    void ship_withoutDefaultShipFromAddress_throwsBadRequest() {
        UUID orderId = UUID.randomUUID();
        when(merchantAddressReadQuery.resolveShipFrom(shopId)).thenReturn(Optional.empty());
        ShipOrderRequest req = new ShipOrderRequest("顺丰速运", "SF1234567890");

        assertThatThrownBy(() -> orderTransitionService.ship(shopId, orderId, req))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getHttpStatus())
                .isEqualTo(400);
    }
}
