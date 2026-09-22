package com.shop.platform.aftersale;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.shop.platform.aftersale.model.TicketAvailableAction;
import com.shop.platform.aftersale.model.TicketStatus;
import com.shop.platform.aftersale.model.TicketType;
import com.shop.platform.aftersale.service.SellerOrderTicketActions;
import com.shop.platform.aftersale.service.SellerTicketItem;
import com.shop.platform.common.Money;
import com.shop.platform.common.PageResult;
import com.shop.platform.testsupport.WebControllerTestSupport;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/**
 * 卖家售后工作台接口契约。分组 = 接口路径（{@code @Nested} 一层一条路由），方法 = HTTP 语义场景。
 *
 * <p>HTTP 独有：X-Shop-Id 成员过滤器守卫、路由与参数绑定（shopId 由 header 落上下文进 service）。
 * 分页查询、订单摘要拼装与筛选语义归 IT（真库）；响应形状由 OpenAPI→SDK 钉死。
 */
class SellerAfterSaleListControllerTest extends WebControllerTestSupport {

    private final UUID userId = UUID.randomUUID();

    private final UUID shopId = UUID.randomUUID();

    @BeforeEach
    void stubMembership() {
        stubSellerMembership();
    }

    /** 工作台一行：本表只断言路由与绑定，字段求契约合法 */
    private SellerTicketItem ticketItem() {
        return new SellerTicketItem(
                UUID.randomUUID(),
                UUID.randomUUID(),
                "20260101120000002",
                "张三",
                1,
                "测试商品",
                TicketType.REFUND_ONLY,
                TicketStatus.APPLYING,
                List.of(TicketAvailableAction.AGREE, TicketAvailableAction.REJECT),
                "包装破损",
                Money.ofFen(19900L, "CNY"),
                null,
                null,
                null,
                OffsetDateTime.now(),
                OffsetDateTime.now());
    }

    private MockHttpServletRequestBuilder sellerGet(String path, Object... vars) {
        return get(path, vars).with(userAuth(userId)).header("X-Shop-Id", shopId.toString());
    }

    @Nested
    class 一页订单的售后动作 { // GET /seller/after-sales/actions

        @Test
        void 成员放行_200_orderIds绑定成列表并带上下文店铺() throws Exception {
            UUID orderId = UUID.randomUUID();
            when(afterSaleService.sellerActionsByOrders(eq(shopId), any()))
                    .thenReturn(List.of(new SellerOrderTicketActions(
                            orderId, List.of(TicketAvailableAction.AGREE, TicketAvailableAction.REJECT))));

            mockMvc.perform(sellerGet("/seller/after-sales/actions")
                            .param("orderIds", orderId.toString())
                            .param("orderIds", UUID.randomUUID().toString()))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$[0].orderId").value(orderId.toString()))
                    .andExpect(jsonPath("$[0].availableActions[0]").value("AGREE"));

            verify(afterSaleService).sellerActionsByOrders(eq(shopId), argThat(ids -> ids.size() == 2));
        }

        @Test
        void 不传orderIds_400() throws Exception {
            mockMvc.perform(sellerGet("/seller/after-sales/actions")).andExpect(status().isBadRequest());
        }
    }

    @Nested
    class 本店售后单 { // GET /seller/after-sales

        @Test
        void 成员放行_200_shopId与筛选值落上下文() throws Exception {
            when(afterSaleService.pageShop(eq(shopId), any(), any()))
                    .thenReturn(new PageResult<>(List.of(ticketItem()), 1));

            mockMvc.perform(sellerGet("/seller/after-sales")
                            .param("page", "1")
                            .param("size", "10")
                            .param("status", "APPLYING"))
                    .andExpect(status().isOk());

            verify(afterSaleService).pageShop(eq(shopId), eq("APPLYING"), any());
        }

        @Test
        void 不带status_200_全部不筛() throws Exception {
            when(afterSaleService.pageShop(eq(shopId), any(), any()))
                    .thenReturn(new PageResult<>(List.of(ticketItem()), 1));

            mockMvc.perform(sellerGet("/seller/after-sales")).andExpect(status().isOk());

            verify(afterSaleService).pageShop(eq(shopId), isNull(), any());
        }

        @Test
        void 缺店铺上下文_403() throws Exception {
            mockMvc.perform(get("/seller/after-sales").with(userAuth(userId)))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.detail").value("缺少店铺上下文（X-Shop-Id）"));
        }
    }
}
