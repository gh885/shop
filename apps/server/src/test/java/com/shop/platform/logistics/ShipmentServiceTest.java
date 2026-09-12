package com.shop.platform.logistics;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.shop.platform.common.BusinessException;
import com.shop.platform.logistics.mapper.CarrierMapper;
import com.shop.platform.logistics.mapper.Shipment;
import com.shop.platform.logistics.mapper.ShipmentMapper;
import com.shop.platform.logistics.mapper.TrackingNodeMapper;
import com.shop.platform.logistics.service.CarrierResolver;
import com.shop.platform.logistics.service.DispatchShipmentCommand;
import com.shop.platform.logistics.service.ShipmentService;
import com.shop.platform.order.api.OrderCommand;
import com.shop.platform.order.api.OrderReadQuery;
import com.shop.platform.order.api.OrderShipmentView;
import com.shop.platform.order.model.OrderStatus;
import com.shop.platform.shop.api.AddressSnapshot;
import com.shop.platform.shop.api.MerchantAddressReadQuery;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * 发货前置闸门单测（快环）：三道门——订单存在/归属、订单可发、寄件人地址已配
 * （承运商那一关由 {@link CarrierResolverTest} 单独覆盖）。
 *
 * <p>闸门顺序是刻意的：归属先于一切（不泄露他店订单是否存在），承运商与地址先于落库
 * （宁可拒绝也不落半个包裹）。这里只断言闸门的拒绝与入参归一；落库与订单推进归真库 IT。
 */
@ExtendWith(MockitoExtension.class)
class ShipmentServiceTest {

    private final UUID shopId = UUID.randomUUID();

    private final UUID orderId = UUID.randomUUID();

    @Mock
    private ShipmentMapper shipmentMapper;

    @Mock
    private TrackingNodeMapper trackingNodeMapper;

    @Mock
    private CarrierMapper carrierMapper;

    /** 字典归一规则在 CarrierResolverTest；这里只关心发货闸门，故整体桩掉 */
    @Mock
    private CarrierResolver carrierResolver;

    @Mock
    private OrderReadQuery orderReadQuery;

    @Mock
    private OrderCommand orderCommand;

    @Mock
    private MerchantAddressReadQuery merchantAddressReadQuery;

    @InjectMocks
    private ShipmentService shipmentService;

    private DispatchShipmentCommand command() {
        return new DispatchShipmentCommand(shopId, orderId, "SF", "SF1234567890");
    }

    private void stubOrder(OrderStatus status) {
        when(orderReadQuery.shipmentViewById(orderId))
                .thenReturn(Optional.of(new OrderShipmentView(orderId, UUID.randomUUID(), shopId, status)));
    }

    private static AddressSnapshot shipFrom() {
        return new AddressSnapshot(
                UUID.randomUUID(),
                UUID.randomUUID(),
                "发货员",
                "13800000000",
                "330106",
                "浙江省",
                "杭州市",
                "西湖区",
                "文一西路 969 号",
                "310000",
                "某某公司");
    }

    @Test
    void 订单不存在_404_且不碰包裹表() {
        when(orderReadQuery.shipmentViewById(orderId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> shipmentService.dispatch(command()))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getHttpStatus())
                .isEqualTo(404);
        verify(shipmentMapper, never()).insert(any(Shipment.class));
    }

    @Test
    void 他店订单_404_与不存在同状态码() {
        when(orderReadQuery.shipmentViewById(orderId))
                .thenReturn(Optional.of(
                        new OrderShipmentView(orderId, UUID.randomUUID(), UUID.randomUUID(), OrderStatus.PAID)));

        assertThatThrownBy(() -> shipmentService.dispatch(command()))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getHttpStatus())
                .isEqualTo(404);
        verify(shipmentMapper, never()).insert(any(Shipment.class));
    }

    @Test
    void 已取消的订单_409_不落包裹() {
        stubOrder(OrderStatus.CANCELLED);

        assertThatThrownBy(() -> shipmentService.dispatch(command()))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getHttpStatus())
                .isEqualTo(409);
        verify(shipmentMapper, never()).insert(any(Shipment.class));
    }

    @Test
    void 快递公司不可用_400_不落包裹() {
        stubOrder(OrderStatus.PAID);
        when(carrierResolver.resolveName("SF")).thenThrow(new BusinessException(400, "该快递公司已停用"));

        assertThatThrownBy(() -> shipmentService.dispatch(command()))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getHttpStatus())
                .isEqualTo(400);
        verify(shipmentMapper, never()).insert(any(Shipment.class));
    }

    @Test
    void 没配默认发货地址_400_不落包裹() {
        stubOrder(OrderStatus.PAID);
        when(carrierResolver.resolveName("SF")).thenReturn("顺丰速运");
        when(merchantAddressReadQuery.resolveShipFrom(shopId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> shipmentService.dispatch(command()))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getHttpStatus())
                .isEqualTo(400);
        verify(shipmentMapper, never()).insert(any(Shipment.class));
    }

    @Test
    void 字典名落库_按解析结果写包裹与订单投影() {
        stubOrder(OrderStatus.PAID);
        when(carrierResolver.resolveName("SF")).thenReturn("顺丰速运");
        when(merchantAddressReadQuery.resolveShipFrom(shopId)).thenReturn(Optional.of(shipFrom()));

        shipmentService.dispatch(command());

        // 归一后的名字写进包裹与订单投影：同一个承运商只有一种展示名
        verify(orderCommand).markShipped(eq(orderId), eq(shopId), eq("顺丰速运"), eq("SF1234567890"), any());
    }
}
