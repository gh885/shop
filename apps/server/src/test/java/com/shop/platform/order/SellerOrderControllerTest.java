package com.shop.platform.order;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.shop.platform.common.PageResult;
import com.shop.platform.order.mapper.Order;
import com.shop.platform.order.model.AfterSaleStatus;
import com.shop.platform.order.model.OrderStatus;
import com.shop.platform.order.service.OrderWithItems;
import com.shop.platform.testsupport.WebControllerTestSupport;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

/**
 * 卖家订单接口契约。分组 = 接口路径（{@code @Nested} 一层一条路由），方法 = HTTP 语义场景。
 *
 * <p>HTTP 独有：X-Shop-Id 成员过滤器守卫（缺头 403 / 非成员 403 / 店铺不可用 403 / 成员放行 200）、
 * 路由与参数绑定（verify，shopId 由 header 落上下文进 service）。本店视图拼装与动作集归 service/IT；
 * 响应形状由 OpenAPI→SDK 钉死。
 */
class SellerOrderControllerTest extends WebControllerTestSupport {

    private final UUID userId = UUID.randomUUID();

    private final UUID shopId = UUID.randomUUID();

    @BeforeEach
    void stubMembership() {
        stubSellerMembership();
    }

    private Order paidOrder() {
        Order o = new Order();
        o.setId(UUID.randomUUID());
        o.setOrderNo("20260101120000002");
        o.setStatus(OrderStatus.PAID);
        o.setAfterSaleStatus(AfterSaleStatus.NONE);
        o.setCurrency("CNY");
        o.setItemAmount(2000L);
        o.setShippingFee(0L);
        // discount_amount 是 NOT NULL DEFAULT 0 的列，夹具必须带上，否则金额四件套拼不出来
        o.setDiscountAmount(0L);
        o.setPayAmount(2000L);
        o.setReceiverName("张三");
        o.setCreatedAt(OffsetDateTime.now());
        return o;
    }

    private org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder sellerGet(
            String path, Object... vars) {
        return get(path, vars).with(userAuth(userId)).header("X-Shop-Id", shopId.toString());
    }

    @Nested
    class 本店订单 { // GET /seller/orders

        @Test
        void 成员放行_200_shopId落上下文() throws Exception {
            when(orderService.pageSeller(eq(shopId), any(), any()))
                    .thenReturn(new PageResult<>(List.of(new OrderWithItems(paidOrder(), List.of())), 1));

            mockMvc.perform(sellerGet("/seller/orders").param("page", "1").param("size", "10"))
                    .andExpect(status().isOk());

            verify(orderService).pageSeller(eq(shopId), any(), any());
        }

        @Test
        void 缺店铺上下文_403() throws Exception {
            mockMvc.perform(get("/seller/orders").with(userAuth(userId)))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.detail").value("缺少店铺上下文（X-Shop-Id）"));
        }

        @Test
        void 非本店成员_403() throws Exception {
            when(shopMemberMapper.findActiveMember(any(), any())).thenReturn(null);

            mockMvc.perform(get("/seller/orders").with(userAuth(userId)).header("X-Shop-Id", shopId.toString()))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.detail").value("你不是该店铺成员"));
        }

        @Test
        void 店铺不存在或不可用_403() throws Exception {
            when(shopMapper.selectCount(any())).thenReturn(0L);

            mockMvc.perform(get("/seller/orders").with(userAuth(userId)).header("X-Shop-Id", shopId.toString()))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.detail").value("店铺不存在或不可用"));
        }
    }

    @Nested
    class 订单详情 { // GET /seller/orders/{id}

        @Test
        void 返回200_绑定id() throws Exception {
            Order order = paidOrder();
            when(orderService.sellerDetail(shopId, order.getId())).thenReturn(new OrderWithItems(order, List.of()));

            mockMvc.perform(sellerGet("/seller/orders/{id}", order.getId())).andExpect(status().isOk());

            verify(orderService).sellerDetail(shopId, order.getId());
        }
    }
}
