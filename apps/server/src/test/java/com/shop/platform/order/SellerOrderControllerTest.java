package com.shop.platform.order;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.shop.platform.common.Money;
import com.shop.platform.common.PageResult;
import com.shop.platform.order.mapper.Order;
import com.shop.platform.order.mapper.Trade;
import com.shop.platform.order.model.AfterSaleStatus;
import com.shop.platform.order.model.OrderStatus;
import com.shop.platform.order.model.TradeStatus;
import com.shop.platform.order.service.DailySalesView;
import com.shop.platform.order.service.OrderWithItems;
import com.shop.platform.testsupport.WebControllerTestSupport;
import java.time.LocalDate;
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
        o.setTradeId(UUID.randomUUID());
        o.setOrderNo("20260101120000002");
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

    private Trade tradeFor(Order order) {
        return Trade.builder()
                .id(order.getTradeId())
                .tradeNo("T20260101120000002")
                .status(TradeStatus.PAID)
                .itemAmount(2000L)
                .shippingFee(0L)
                .discountAmount(0L)
                .payAmount(2000L)
                .paidAmount(2000L)
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

    private OrderWithItems withItems(Order o) {
        return new OrderWithItems(o, List.of(), tradeFor(o));
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
                    .thenReturn(new PageResult<>(List.of(withItems(paidOrder())), 1));

            mockMvc.perform(sellerGet("/seller/orders").param("page", "1").param("size", "10"))
                    .andExpect(status().isOk());

            verify(orderService).pageSeller(eq(shopId), any(), any());
        }

        /** 一行列表就带一屏号码是批量出口，所以列表列同样是掩码（ORD-62） */
        @Test
        void 收件人电话_出参是掩码() throws Exception {
            when(orderService.pageSeller(eq(shopId), any(), any()))
                    .thenReturn(new PageResult<>(List.of(withItems(paidOrder())), 1));

            mockMvc.perform(sellerGet("/seller/orders").param("page", "1").param("size", "10"))
                    .andExpect(jsonPath("$.records[0].receiverPhone").value("138****1234"));
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
            when(shopMapper.existsUsable(any())).thenReturn(false);

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
            when(orderService.sellerDetail(shopId, order.getId())).thenReturn(withItems(order));

            mockMvc.perform(sellerGet("/seller/orders/{id}", order.getId())).andExpect(status().isOk());

            verify(orderService).sellerDetail(shopId, order.getId());
        }

        /** 收件人电话是掩码：卖家侧任何批量出参都不带明文（ORD-62） */
        @Test
        void 收件人电话_出参是掩码() throws Exception {
            Order order = paidOrder();
            when(orderService.sellerDetail(shopId, order.getId())).thenReturn(withItems(order));

            mockMvc.perform(sellerGet("/seller/orders/{id}", order.getId()))
                    .andExpect(jsonPath("$.receiverPhone").value("138****1234"));
        }
    }

    @Nested
    class 查看买家电话 { // POST /seller/orders/{id}/receiver-phone

        /** 明文只从这一跳出，且带操作人（service 侧打点留痕）；越店与不存在同为 404，归 service 门 */
        @Test
        void 返回200_明文带操作人() throws Exception {
            Order order = paidOrder();
            when(orderService.sellerReceiverPhone(shopId, order.getId(), userId))
                    .thenReturn("13800001234");

            mockMvc.perform(post("/seller/orders/{id}/receiver-phone", order.getId())
                            .with(userAuth(userId))
                            .header("X-Shop-Id", shopId.toString()))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.phone").value("13800001234"));

            verify(orderService).sellerReceiverPhone(shopId, order.getId(), userId);
        }

        @Test
        void 缺店铺上下文_403() throws Exception {
            mockMvc.perform(post("/seller/orders/{id}/receiver-phone", UUID.randomUUID())
                            .with(userAuth(userId)))
                    .andExpect(status().isForbidden());
        }
    }

    @Nested
    class 每日销售额 { // GET /seller/orders/sales/daily

        /** 出参形状由契约钉死：数组每项 {date, amount:{amount,currency}}，金额是 Money 不是裸分 */
        @Test
        void 返回200_shopId落上下文_金额是Money() throws Exception {
            when(orderService.sellerDailySales(shopId))
                    .thenReturn(List.of(new DailySalesView(LocalDate.of(2026, 10, 15), Money.cny(5000))));

            mockMvc.perform(sellerGet("/seller/orders/sales/daily"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$[0].date").value("2026-10-15"))
                    .andExpect(jsonPath("$[0].amount.amount").value(5000))
                    .andExpect(jsonPath("$[0].amount.currency").value("CNY"));

            verify(orderService).sellerDailySales(shopId);
        }

        @Test
        void 缺店铺上下文_403() throws Exception {
            mockMvc.perform(get("/seller/orders/sales/daily").with(userAuth(userId)))
                    .andExpect(status().isForbidden());
        }
    }
}
