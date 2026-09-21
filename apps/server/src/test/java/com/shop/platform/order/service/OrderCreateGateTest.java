package com.shop.platform.order.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.shop.platform.account.api.UserReadQuery;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.Money;
import com.shop.platform.coupon.api.CouponCommand;
import com.shop.platform.inventory.api.StockCommand;
import com.shop.platform.order.dto.CreateOrderRequest;
import com.shop.platform.order.dto.OrderLineRequest;
import com.shop.platform.order.mapper.OrderItemMapper;
import com.shop.platform.order.mapper.OrderMapper;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;

/**
 * 下单入口的两道闸门（全 mock 单测，不碰库）：买家状态非 ACTIVE 一律 403 + code USER_DISABLED，
 * 与登录闸门同一份语义——token 未过期不等于账号还能交易；店铺非 ACTIVE 一律 409「店铺已停止营业」（无 code）。
 * 闸门必须挡在一切数据动作之前：地址、库存、券、事件都要在放行之后才被触达。
 * 下钻到 service 包：协作者 {@link CheckoutResolver} 是包私有类型，构造被测服务需要引用它。
 */
@ExtendWith(MockitoExtension.class)
class OrderCreateGateTest {

    private final UUID userId = UUID.randomUUID();

    @Mock
    private OrderMapper orderMapper;

    @Mock
    private OrderItemMapper orderItemMapper;

    @Mock
    private CheckoutResolver checkoutResolver;

    @Mock
    private UserReadQuery userReadQuery;

    @Mock
    private com.shop.platform.shop.api.ShopReadQuery shopReadQuery;

    @Mock
    private StockCommand stockCommand;

    @Mock
    private CouponCommand couponCommand;

    @Mock
    private OrderStatusLogWriter statusLogWriter;

    @Mock
    private ApplicationEventPublisher events;

    private OrderService service;

    @BeforeEach
    void 组装服务() {
        service = new OrderService(
                orderMapper,
                orderItemMapper,
                checkoutResolver,
                userReadQuery,
                shopReadQuery,
                stockCommand,
                couponCommand,
                statusLogWriter,
                events);
    }

    private CreateOrderRequest 最小下单请求() {
        return new CreateOrderRequest(
                UUID.randomUUID(), UUID.randomUUID(), List.of(new OrderLineRequest(UUID.randomUUID(), 1)), null, null);
    }

    @Test
    void 禁用账号_下单拒绝_403且触达不了任何数据动作() {
        when(userReadQuery.isActive(userId)).thenReturn(false);

        assertThatThrownBy(() -> service.create(userId, 最小下单请求()))
                .isInstanceOfSatisfying(BusinessException.class, e -> {
                    assertThat(e.getHttpStatus()).isEqualTo(403);
                    assertThat(e.getCode()).isEqualTo("USER_DISABLED");
                });

        verifyNoInteractions(
                orderMapper,
                orderItemMapper,
                checkoutResolver,
                shopReadQuery,
                stockCommand,
                couponCommand,
                statusLogWriter,
                events);
    }

    @Test
    void 正常账号_过了闸门才继续校验收货地址() {
        when(userReadQuery.isActive(userId)).thenReturn(true);
        // 地址不存在 → 闸门放行后在下一步被挡；触达 loadAddressSnapshot 即证明闸门未误拦
        when(checkoutResolver.loadAddressSnapshot(any(), any())).thenThrow(BusinessException.notFound("收货地址不存在"));

        assertThatThrownBy(() -> service.create(userId, 最小下单请求()))
                .isInstanceOf(BusinessException.class)
                .hasMessage("收货地址不存在");

        verify(checkoutResolver).loadAddressSnapshot(any(), any());
    }

    @Test
    void 用户不存在视同禁用_下单拒绝() {
        // UserReadQuery.isActive 对缺失用户给 false（不做物理删除之外的缺席也拦）
        when(userReadQuery.isActive(userId)).thenReturn(false);

        assertThatThrownBy(() -> service.create(userId, 最小下单请求()))
                .isInstanceOfSatisfying(
                        BusinessException.class, e -> assertThat(e.getCode()).isEqualTo("USER_DISABLED"));
    }

    /**
     * 营业闸门（shop :: api 的 ShopReadQuery.isActive）：店非 ACTIVE 一律 409「店铺已停止营业」，不带 code
     * （前端按 status 分支即可，与下架/售罄同一口径）。闸门在落库与冻结之前——订单、库存、券、事件都不该被触达。
     */
    @Test
    void 店铺已停业_下单拒绝_409且落不到任何交易动作() {
        UUID shopId = UUID.randomUUID();
        when(userReadQuery.isActive(userId)).thenReturn(true);
        when(checkoutResolver.loadAddressSnapshot(any(), any())).thenReturn(SHIPPING_SNAPSHOT);
        when(checkoutResolver.resolve(any()))
                .thenReturn(new CheckoutResolver.ResolvedCheckout(
                        List.of(new ValidLine(
                                UUID.randomUUID(), UUID.randomUUID(), shopId, "x", null, Money.cny(100), null, 1, 5)),
                        List.of()));
        when(shopReadQuery.isActive(shopId)).thenReturn(false);

        assertThatThrownBy(() -> service.create(userId, 最小下单请求()))
                .isInstanceOfSatisfying(BusinessException.class, e -> {
                    assertThat(e.getHttpStatus()).isEqualTo(409);
                    assertThat(e.getDetail()).isEqualTo("店铺已停止营业");
                    assertThat(e.getCode()).isNull(); // 不新增 error code
                });

        verifyNoInteractions(orderMapper, orderItemMapper, stockCommand, couponCommand, statusLogWriter, events);
    }

    /** 测试用收货快照（闸门只关心走没走到落库，字段内容无所谓） */
    private static final AddressSnapshot SHIPPING_SNAPSHOT =
            new AddressSnapshot("张三", "13800000000", "110105", "北京市", "北京市", "朝阳区", "测试路 1 号");
}
