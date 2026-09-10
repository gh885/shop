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

import com.shop.platform.order.mapper.Order;
import com.shop.platform.order.model.AfterSaleStatus;
import com.shop.platform.order.model.OrderStatus;
import com.shop.platform.order.service.OrderWithItems;
import com.shop.platform.testsupport.WebControllerTestSupport;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

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

    @Nested
    class 创建订单 { // POST /orders/create

        @Test
        void 合法body_201() throws Exception {
            when(orderPlacementService.place(eq(userId), any())).thenReturn(List.of(pendingOrder()));

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
    }

    @Nested
    class 我的订单 { // GET /orders/mine

        @Test
        void 未登录_401() throws Exception {
            mockMvc.perform(get("/orders/mine")).andExpect(status().isUnauthorized());
        }
    }

    @Nested
    class 订单详情 { // GET /orders/{id}

        @Test
        void 返回200_绑定id() throws Exception {
            when(orderService.detail(userId, orderId)).thenReturn(new OrderWithItems(pendingOrder(), List.of()));

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
}
