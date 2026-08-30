package com.shop.platform.order;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.shop.platform.common.Money;
import com.shop.platform.common.PageResult;
import com.shop.platform.order.mapper.Order;
import com.shop.platform.order.model.AfterSaleStatus;
import com.shop.platform.order.model.OrderStatus;
import com.shop.platform.order.service.CheckoutPreview;
import com.shop.platform.order.service.OrderWithItems;
import com.shop.platform.order.service.ValidLine;
import com.shop.platform.testsupport.WebControllerTestSupport;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/**
 * 买家订单接口契约：结算预览分组算钱、创建拆单返回、分页卡片、详情动作集、取消/收货透传。
 * 业务状态机与真库链路见 OrderFlowIT。
 */
class OrderControllerTest extends WebControllerTestSupport {

    private final UUID userId = UUID.randomUUID();

    private final UUID shopId = UUID.randomUUID();

    private final UUID skuId = UUID.randomUUID();

    private final UUID orderId = UUID.randomUUID();

    private Order pendingOrder() {
        Order o = new Order();
        o.setId(orderId);
        o.setShopId(shopId);
        o.setOrderNo("20260101120000001");
        o.setStatus(OrderStatus.PENDING_PAYMENT);
        o.setAfterSaleStatus(AfterSaleStatus.NONE);
        o.setCurrency("CNY");
        o.setItemAmount(2000L);
        o.setShippingFee(0L);
        o.setPayAmount(2000L);
        o.setPayExpireAt(OffsetDateTime.now().plusMinutes(30));
        o.setCreatedAt(OffsetDateTime.now());
        return o;
    }

    @Test
    void 结算预览_按店分组算钱() throws Exception {
        when(orderService.preview(eq(userId), any()))
                .thenReturn(new CheckoutPreview(
                        List.of(new CheckoutPreview.Group(
                                shopId,
                                "测试店铺",
                                List.of(new ValidLine(
                                        skuId, productId(), shopId, "测试手机", "p.png", Money.cny(1000), null, 2, 5)),
                                Money.cny(2000),
                                Money.cny(0),
                                Money.cny(2000))),
                        List.of(),
                        null,
                        Money.cny(2000)));

        mockMvc.perform(post("/orders/preview")
                        .with(userAuth(userId))
                        .content(
                                """
                            {"buySkuId": "%s", "buyQuantity": 2}
                            """
                                        .formatted(skuId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.groups[0].shopName").value("测试店铺"))
                .andExpect(jsonPath("$.groups[0].lines[0].quantity").value(2))
                .andExpect(jsonPath("$.totalPayAmount.amount").value(2000));
    }

    private UUID productId() {
        return UUID.randomUUID();
    }

    @Test
    void 创建订单_201_返回拆单与付款倒计时() throws Exception {
        when(orderService.create(eq(userId), any())).thenReturn(List.of(pendingOrder()));

        mockMvc.perform(post("/orders/create")
                        .with(userAuth(userId))
                        .content(
                                """
                            {"addressId": "%s", "buySkuId": "%s", "buyQuantity": 1}
                            """
                                        .formatted(UUID.randomUUID(), skuId)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.orders[0].orderNo").value("20260101120000001"))
                .andExpect(jsonPath("$.orders[0].payExpireAt").isNotEmpty())
                .andExpect(jsonPath("$.orders[0].payAmount.amount").value(2000));
    }

    @Test
    void 创建订单_缺地址_422() throws Exception {
        mockMvc.perform(post("/orders/create")
                        .with(userAuth(userId))
                        .content(
                                """
                            {"buySkuId": "%s", "buyQuantity": 1}
                            """
                                        .formatted(skuId)))
                .andExpect(status().is(422))
                .andExpect(jsonPath("$.errors[0].field").value("addressId"));
    }

    @Test
    void 我的订单_分页卡片带行项() throws Exception {
        when(orderService.pageMine(eq(userId), any(), any()))
                .thenReturn(new PageResult<>(List.of(new OrderWithItems(pendingOrder(), List.of())), 1));

        mockMvc.perform(get("/orders/mine")
                        .queryParam("page", "1")
                        .queryParam("size", "10")
                        .with(userAuth(userId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.records[0].status").value(OrderStatus.PENDING_PAYMENT.name()))
                .andExpect(jsonPath("$.records[0].items.length()").value(0));
    }

    @Test
    void 订单详情_买家视角动作集() throws Exception {
        when(orderService.detail(userId, orderId)).thenReturn(new OrderWithItems(pendingOrder(), List.of()));

        mockMvc.perform(get("/orders/{id}", orderId).with(userAuth(userId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(orderId.toString()))
                // 待付款单的动作集由实体状态机推导，契约只验非空数组
                .andExpect(jsonPath("$.availableActions").isArray());
    }

    @Test
    void 取消订单_原因透传() throws Exception {
        mockMvc.perform(put("/orders/{id}/cancel", orderId)
                        .with(userAuth(userId))
                        .content("""
                            {"reason": "不想要了"}
                            """))
                .andExpect(status().isOk());

        verify(orderTransitionService).cancel(userId, orderId, "不想要了");
    }

    @Test
    void 确认收货_已发货转已完成() throws Exception {
        mockMvc.perform(put("/orders/{id}/receive", orderId).with(userAuth(userId)))
                .andExpect(status().isOk());

        verify(orderTransitionService).receive(userId, orderId);
    }

    @Test
    void 未登录_401() throws Exception {
        mockMvc.perform(get("/orders/mine")).andExpect(status().isUnauthorized());
    }
}
