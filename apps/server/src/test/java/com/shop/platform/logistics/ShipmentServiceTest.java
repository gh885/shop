package com.shop.platform.logistics;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.shop.platform.common.BusinessException;
import com.shop.platform.logistics.api.ShipmentFactsQuery;
import com.shop.platform.logistics.mapper.CarrierMapper;
import com.shop.platform.logistics.mapper.Shipment;
import com.shop.platform.logistics.mapper.ShipmentLine;
import com.shop.platform.logistics.mapper.ShipmentLineMapper;
import com.shop.platform.logistics.mapper.ShipmentMapper;
import com.shop.platform.logistics.mapper.TrackingNodeMapper;
import com.shop.platform.logistics.model.ShipmentDirection;
import com.shop.platform.logistics.model.ShipmentStatus;
import com.shop.platform.logistics.service.CarrierResolver;
import com.shop.platform.logistics.service.DispatchShipmentCommand;
import com.shop.platform.logistics.service.ShipmentService;
import com.shop.platform.order.api.OrderCommand;
import com.shop.platform.order.api.OrderFulfillmentFacts;
import com.shop.platform.order.api.OrderReadQuery;
import com.shop.platform.order.api.OrderShipmentLineView;
import com.shop.platform.order.api.OrderShipmentView;
import com.shop.platform.order.model.OrderStatus;
import com.shop.platform.shop.api.AddressSnapshot;
import com.shop.platform.shop.api.MerchantAddressReadQuery;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * 发货闸门的单测（快环）：录单的四道门——订单存在/归属、订单可发、行属于该单且不超过可发量、
 * 寄件人地址已配（承运商那一关由 {@link CarrierResolverTest} 单独覆盖）。
 *
 * <p>闸门顺序是刻意的：归属先于一切（不泄露他店订单是否存在），行校验与承运商/地址先于落库
 * （宁可拒绝也不落半个包裹）。落库与订单推进归真库 IT。
 */
@ExtendWith(MockitoExtension.class)
class ShipmentServiceTest {

    private final UUID shopId = UUID.randomUUID();

    private final UUID orderId = UUID.randomUUID();

    private final UUID orderItemId = UUID.randomUUID();

    @Mock
    private ShipmentMapper shipmentMapper;

    @Mock
    private ShipmentLineMapper shipmentLineMapper;

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

    @Mock
    private ShipmentFactsQuery shipmentFactsQuery;

    @InjectMocks
    private ShipmentService shipmentService;

    private DispatchShipmentCommand command(int quantity) {
        return new DispatchShipmentCommand(
                shopId,
                orderId,
                "SF",
                "SF1234567890",
                List.of(new DispatchShipmentCommand.Line(orderItemId, quantity)));
    }

    private void stubOrder(OrderStatus status) {
        when(orderReadQuery.shipmentViewById(orderId))
                .thenReturn(Optional.of(new OrderShipmentView(
                        orderId,
                        UUID.randomUUID(),
                        shopId,
                        status,
                        status == OrderStatus.PAID
                                        || status == OrderStatus.PARTIALLY_SHIPPED
                                        || status == OrderStatus.SHIPPED
                                ? OffsetDateTime.now()
                                : null)));
    }

    private void stubLine(int quantity, int settled) {
        when(orderReadQuery.shipmentLinesById(orderId))
                .thenReturn(List.of(new OrderShipmentLineView(orderItemId, quantity, settled, settled)));
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

        assertThatThrownBy(() -> shipmentService.record(command(1)))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getHttpStatus())
                .isEqualTo(404);
        verify(shipmentMapper, never()).insert(any(Shipment.class));
    }

    @Test
    void 他店订单_404_与不存在同状态码() {
        when(orderReadQuery.shipmentViewById(orderId))
                .thenReturn(Optional.of(new OrderShipmentView(
                        orderId, UUID.randomUUID(), UUID.randomUUID(), OrderStatus.PAID, OffsetDateTime.now())));

        assertThatThrownBy(() -> shipmentService.record(command(1)))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getHttpStatus())
                .isEqualTo(404);
        verify(shipmentMapper, never()).insert(any(Shipment.class));
    }

    @Test
    void 已取消的订单_409_不落包裹() {
        stubOrder(OrderStatus.CANCELLED);

        assertThatThrownBy(() -> shipmentService.record(command(1)))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getHttpStatus())
                .isEqualTo(409);
        verify(shipmentMapper, never()).insert(any(Shipment.class));
    }

    /** 子订单创建即待发货，PAID 不代表付过钱：paid_at 为空时不允许发货（§4.2） */
    @Test
    void 未支付的待发货单_409_不落包裹() {
        when(orderReadQuery.shipmentViewById(orderId))
                .thenReturn(
                        Optional.of(new OrderShipmentView(orderId, UUID.randomUUID(), shopId, OrderStatus.PAID, null)));

        assertThatThrownBy(() -> shipmentService.record(command(1)))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getHttpStatus())
                .isEqualTo(409);
        verify(shipmentMapper, never()).insert(any(Shipment.class));
    }

    /** 发货守卫（§8）：已结清的量不再重复发，超发在录单时就拒绝 */
    @Test
    void 数量超过该行可发量_409_不落包裹() {
        stubOrder(OrderStatus.PARTIALLY_SHIPPED);
        stubLine(5, 4);

        assertThatThrownBy(() -> shipmentService.record(command(2)))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getHttpStatus())
                .isEqualTo(409);
        verify(shipmentMapper, never()).insert(any(Shipment.class));
    }

    @Test
    void 快递公司不可用_400_不落包裹() {
        stubOrder(OrderStatus.PAID);
        stubLine(5, 0);
        when(carrierResolver.resolveName("SF")).thenThrow(new BusinessException(400, "该快递公司已停用"));

        assertThatThrownBy(() -> shipmentService.record(command(1)))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getHttpStatus())
                .isEqualTo(400);
        verify(shipmentMapper, never()).insert(any(Shipment.class));
    }

    @Test
    void 没配默认发货地址_400_不落包裹() {
        stubOrder(OrderStatus.PAID);
        stubLine(5, 0);
        when(carrierResolver.resolveName("SF")).thenReturn("顺丰速运");
        when(merchantAddressReadQuery.resolveShipFrom(shopId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> shipmentService.record(command(1)))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getHttpStatus())
                .isEqualTo(400);
        verify(shipmentMapper, never()).insert(any(Shipment.class));
    }

    /** 录单只占行、不发货：包裹落成待发货，订单账本一动不动 */
    @Test
    void 录单落待发货包裹与行_不动订单账本() {
        stubOrder(OrderStatus.PAID);
        stubLine(5, 0);
        when(carrierResolver.resolveName("SF")).thenReturn("顺丰速运");
        when(merchantAddressReadQuery.resolveShipFrom(shopId)).thenReturn(Optional.of(shipFrom()));

        shipmentService.record(command(2));

        ArgumentCaptor<Shipment> shipment = ArgumentCaptor.forClass(Shipment.class);
        verify(shipmentMapper).insert(shipment.capture());
        assertThat(shipment.getValue().getStatus()).isEqualTo(ShipmentStatus.PENDING_DISPATCH);
        assertThat(shipment.getValue().getCarrierName()).isEqualTo("顺丰速运");
        assertThat(shipment.getValue().getShippedAt()).isNull();

        ArgumentCaptor<ShipmentLine> line = ArgumentCaptor.forClass(ShipmentLine.class);
        verify(shipmentLineMapper).insert(line.capture());
        assertThat(line.getValue().getOrderItemId()).isEqualTo(orderItemId);
        assertThat(line.getValue().getQuantity()).isEqualTo(2);

        verify(orderCommand, never()).recordShipment(any(), any(), any(), any(), any());
    }

    /** 交寄：包裹推进 + 订单事实入账 + 履约态重算，三件事在同一个事务里 */
    @Test
    void 交寄_写订单事实并入账重算() {
        Shipment pending = Shipment.builder()
                .id(UUID.randomUUID())
                .orderId(orderId)
                .shopId(shopId)
                .direction(ShipmentDirection.FORWARD)
                .carrierName("顺丰速运")
                .trackingNo("SF1234567890")
                .status(ShipmentStatus.PENDING_DISPATCH)
                .build();
        when(shipmentMapper.selectById(pending.getId())).thenReturn(pending);
        stubOrder(OrderStatus.PAID);
        when(shipmentMapper.markDispatched(eq(pending.getId()), eq(shopId), any()))
                .thenReturn(1);
        when(shipmentLineMapper.selectByShipmentId(pending.getId()))
                .thenReturn(List.of(ShipmentLine.builder()
                        .shipmentId(pending.getId())
                        .orderItemId(orderItemId)
                        .quantity(2)
                        .build()));
        when(shipmentFactsQuery.forwardFacts(orderId)).thenReturn(new OrderFulfillmentFacts(true, false, null));

        shipmentService.dispatch(shopId, pending.getId());

        verify(orderCommand).recordShipment(eq(orderId), eq(shopId), eq("顺丰速运"), eq("SF1234567890"), any());
        verify(orderCommand).applyShippedQuantity(eq(orderId), eq(Map.of(orderItemId, 2)));
        verify(orderCommand).recalcFulfillment(eq(orderId), eq(new OrderFulfillmentFacts(true, false, null)));
    }
}
