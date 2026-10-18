package com.shop.platform.order;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
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
import com.shop.platform.order.mapper.Trade;
import com.shop.platform.order.model.AfterSaleStatus;
import com.shop.platform.order.model.OrderStatus;
import com.shop.platform.order.model.TradeStatus;
import com.shop.platform.order.service.CheckoutPreview;
import com.shop.platform.order.service.OrderDetailView;
import com.shop.platform.order.service.OrderService;
import com.shop.platform.order.service.OrderWithItems;
import com.shop.platform.testsupport.WebControllerTestSupport;
import java.time.OffsetDateTime;
import java.util.Collections;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/**
 * 买家订单接口契约。分组 = 接口路径（{@code @Nested} 一层一条路由），方法 = HTTP 语义场景。
 *
 * <p>只断言 HTTP 边界独有的失败面：status、鉴权守卫（401）、请求入参校验（422）、方法路由与参数绑定（verify）。
 * 业务状态机与结算分组归 OrderTest / aftersale 的 TicketActionTest / CheckoutResolverTest / OrderFlowIT；响应形状由 OpenAPI→SDK 钉死。
 */
class OrderControllerTest extends WebControllerTestSupport {

    private final UUID userId = UUID.randomUUID();

    private final UUID shopId = UUID.randomUUID();

    private final UUID skuId = UUID.randomUUID();

    private final UUID orderId = UUID.randomUUID();

    private final UUID tradeId = UUID.randomUUID();

    private Order pendingOrder() {
        Order o = new Order();
        o.setId(orderId);
        o.setTradeId(tradeId);
        o.setShopId(shopId);
        o.setOrderNo("20260101120000001");
        o.setStatus(OrderStatus.PAID);
        o.setAfterSaleStatus(AfterSaleStatus.NONE);
        o.setCurrency("CNY");
        o.setItemAmount(2000L);
        o.setShippingFee(0L);
        // discount_amount 是 NOT NULL DEFAULT 0 的列，夹具必须带上，否则金额四件套拼不出来
        o.setDiscountAmount(0L);
        o.setPayAmount(2000L);
        o.setCreatedAt(OffsetDateTime.now());
        return o;
    }

    private Trade trade() {
        return Trade.builder()
                .id(tradeId)
                .tradeNo("T20260101120000001")
                .status(TradeStatus.PENDING_PAYMENT)
                .itemAmount(2000L)
                .shippingFee(0L)
                .discountAmount(0L)
                .payAmount(2000L)
                .paidAmount(0L)
                .refundedAmount(0L)
                .compensatedAmount(0L)
                .currency("CNY")
                .receiverName("张三")
                .receiverPhone("13800001234")
                .receiverRegionCode("110105")
                .receiverProvince("北京市")
                .receiverCity("北京市")
                .receiverDistrict("朝阳区")
                .receiverDetail("测试路 1 号")
                .payExpireAt(OffsetDateTime.now().plusMinutes(30))
                .build();
    }

    /** n 行同 SKU 的结算行 JSON：@Size 闸门在行合并之前，重复 skuId 不影响触发 */
    private String linesJson(int n) {
        String line = "{\"skuId\": \"%s\", \"quantity\": 1}".formatted(skuId);
        return Collections.nCopies(n, line).stream().collect(Collectors.joining(","));
    }

    @Nested
    class 创建订单 { // POST /orders/create

        @Test
        void 合法body_201() throws Exception {
            when(orderPlacementService.place(eq(userId), any()))
                    .thenReturn(new OrderService.CreatedTrade(trade(), List.of(pendingOrder())));

            mockMvc.perform(post("/orders/create")
                            .with(userAuth(userId))
                            .content(
                                    """
                                {"checkoutKey": "%s", "addressId": "%s", "lines": [{"skuId": "%s", "quantity": 1}]}
                                """
                                            .formatted(UUID.randomUUID(), UUID.randomUUID(), skuId)))
                    .andExpect(status().isCreated());
        }

        @Test
        void 缺addressId_422() throws Exception {
            mockMvc.perform(post("/orders/create")
                            .with(userAuth(userId))
                            .content(
                                    """
                                {"checkoutKey": "%s", "lines": [{"skuId": "%s", "quantity": 1}]}
                                """
                                            .formatted(UUID.randomUUID(), skuId)))
                    .andExpect(status().is(422))
                    .andExpect(jsonPath("$.errors[0].field").value("addressId"));
        }

        @Test
        void 缺checkoutKey_422() throws Exception {
            mockMvc.perform(post("/orders/create")
                            .with(userAuth(userId))
                            .content(
                                    """
                                {"addressId": "%s", "lines": [{"skuId": "%s", "quantity": 1}]}
                                """
                                            .formatted(UUID.randomUUID(), skuId)))
                    .andExpect(status().is(422))
                    .andExpect(jsonPath("$.errors[0].field").value("checkoutKey"));
        }

        @Test
        void 结算行超99_422() throws Exception {
            mockMvc.perform(post("/orders/create")
                            .with(userAuth(userId))
                            .content(
                                    """
                                {"checkoutKey": "%s", "addressId": "%s", "lines": [%s]}
                                """
                                            .formatted(UUID.randomUUID(), UUID.randomUUID(), linesJson(100))))
                    .andExpect(status().is(422))
                    .andExpect(jsonPath("$.errors[0].field").value("lines"))
                    .andExpect(jsonPath("$.errors[0].message").value("结算条目需 1 到 99 行"));
        }
    }

    @Nested
    class 结算预览 { // POST /orders/preview

        @Test
        void 未登录_401() throws Exception {
            mockMvc.perform(post("/orders/preview")
                            .content(
                                    """
                                {"lines": [{"skuId": "%s", "quantity": 1}]}
                                """
                                            .formatted(skuId)))
                    .andExpect(status().isUnauthorized());
        }

        @Test
        void 结算行为空_422() throws Exception {
            mockMvc.perform(
                            post("/orders/preview")
                                    .with(userAuth(userId))
                                    .content(
                                            """
                                {"lines": []}
                                """))
                    .andExpect(status().is(422))
                    .andExpect(jsonPath("$.errors[0].field").value("lines"));
        }

        @Test
        void 结算行超99_422() throws Exception {
            mockMvc.perform(post("/orders/preview")
                            .with(userAuth(userId))
                            .content("""
                                    {"lines": [%s]}"""
                                    .formatted(linesJson(100))))
                    .andExpect(status().is(422))
                    .andExpect(jsonPath("$.errors[0].field").value("lines"))
                    .andExpect(jsonPath("$.errors[0].message").value("结算条目需 1 到 99 行"));
        }

        /** 预览的地址可选（前端未选地址时传 null），但行必填：入参得原样递到 service */
        @Test
        void 地址可缺省_绑定当前用户与结算行() throws Exception {
            when(orderService.preview(eq(userId), any()))
                    .thenReturn(new CheckoutPreview(List.of(), List.of(), null, Money.cny(0)));

            mockMvc.perform(post("/orders/preview")
                            .with(userAuth(userId))
                            .content(
                                    """
                                {"lines": [{"skuId": "%s", "quantity": 2}]}
                                """
                                            .formatted(skuId)))
                    .andExpect(status().isOk());

            ArgumentCaptor<com.shop.platform.order.dto.PreviewOrderRequest> captured =
                    ArgumentCaptor.forClass(com.shop.platform.order.dto.PreviewOrderRequest.class);
            verify(orderService).preview(eq(userId), captured.capture());
            assertNull(captured.getValue().addressId());
            assertEquals(1, captured.getValue().lines().size());
            assertEquals(skuId, captured.getValue().lines().getFirst().skuId());
            assertEquals(2, captured.getValue().lines().getFirst().quantity());
        }

        @Test
        void 指定地址_透传地址ID() throws Exception {
            UUID addressId = UUID.randomUUID();
            when(orderService.preview(eq(userId), any()))
                    .thenReturn(new CheckoutPreview(List.of(), List.of(), null, Money.cny(0)));

            mockMvc.perform(post("/orders/preview")
                            .with(userAuth(userId))
                            .content(
                                    """
                                {"addressId": "%s", "lines": [{"skuId": "%s", "quantity": 1}]}
                                """
                                            .formatted(addressId, skuId)))
                    .andExpect(status().isOk());

            ArgumentCaptor<com.shop.platform.order.dto.PreviewOrderRequest> captured =
                    ArgumentCaptor.forClass(com.shop.platform.order.dto.PreviewOrderRequest.class);
            verify(orderService).preview(eq(userId), captured.capture());
            assertEquals(addressId, captured.getValue().addressId());
        }
    }

    @Nested
    class 我的订单 { // GET /orders/trades/mine

        @Test
        void 未登录_401() throws Exception {
            mockMvc.perform(get("/orders/trades/mine")).andExpect(status().isUnauthorized());
        }

        @Test
        void 主进度筛选透传() throws Exception {
            when(orderService.pageMyTrades(eq(userId), eq("PARTIALLY_SHIPPED"), any()))
                    .thenReturn(new PageResult<>(List.of(), 0));

            mockMvc.perform(get("/orders/trades/mine")
                            .param("progress", "PARTIALLY_SHIPPED")
                            .with(userAuth(userId)))
                    .andExpect(status().isOk());

            verify(orderService).pageMyTrades(eq(userId), eq("PARTIALLY_SHIPPED"), any());
        }
    }

    @Nested
    class 订单详情 { // GET /orders/{id}

        @Test
        void 返回200_绑定id() throws Exception {
            OrderWithItems order = new OrderWithItems(pendingOrder(), List.of(), trade());
            when(orderService.detail(userId, orderId)).thenReturn(OrderDetailView.buyerView(order, null));

            mockMvc.perform(get("/orders/{id}", orderId).with(userAuth(userId))).andExpect(status().isOk());

            verify(orderService).detail(userId, orderId);
        }
    }

    @Nested
    class 取消订单 { // PUT /orders/{id}/cancel

        @Test
        void 原因透传() throws Exception {
            mockMvc.perform(
                            put("/orders/{id}/cancel", orderId)
                                    .with(userAuth(userId))
                                    .content(
                                            """
                                {"reason": "不想要了"}
                                """))
                    .andExpect(status().isOk());

            verify(orderTransitionService).cancel(userId, orderId, "不想要了");
        }
    }

    @Nested
    class 确认收货 { // PUT /orders/{id}/receive

        @Test
        void 返回200() throws Exception {
            mockMvc.perform(put("/orders/{id}/receive", orderId).with(userAuth(userId)))
                    .andExpect(status().isOk());

            verify(orderTransitionService).receive(userId, orderId);
        }
    }

    @Nested
    class 延长收货 { // PUT /orders/{id}/receive/extend

        @Test
        void 未登录_401() throws Exception {
            mockMvc.perform(put("/orders/{id}/receive/extend", orderId)).andExpect(status().isUnauthorized());
        }

        /** 无请求体：天数与额度是服务端常量，收 body 就等于把业务规则交给客户端改写（ORD-63） */
        @Test
        void 返回200_无请求体() throws Exception {
            mockMvc.perform(put("/orders/{id}/receive/extend", orderId).with(userAuth(userId)))
                    .andExpect(status().isOk());

            verify(orderTransitionService).extendReceive(userId, orderId);
        }
    }
}
