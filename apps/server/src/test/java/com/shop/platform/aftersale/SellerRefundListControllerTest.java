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

import com.shop.platform.aftersale.model.AfterSaleReason;
import com.shop.platform.aftersale.model.RefundAvailableAction;
import com.shop.platform.aftersale.model.RefundStatus;
import com.shop.platform.aftersale.model.RefundType;
import com.shop.platform.aftersale.service.SellerOrderRefundActions;
import com.shop.platform.aftersale.service.SellerRefundItem;
import com.shop.platform.common.Money;
import com.shop.platform.common.PageResult;
import com.shop.platform.common.Quantities;
import com.shop.platform.testsupport.WebControllerTestSupport;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/**
 * 卖家退款工作台接口契约。分组 = 接口路径（{@code @Nested} 一层一条路由），方法 = HTTP 语义场景。
 *
 * <p>HTTP 独有：X-Shop-Id 成员过滤器守卫、路由与参数绑定（shopId 由 header 落上下文进 service）。
 * 分页查询、订单摘要拼装与筛选语义归 IT（真库）；响应形状由 OpenAPI→SDK 钉死。
 */
class SellerRefundListControllerTest extends WebControllerTestSupport {

    private final UUID userId = UUID.randomUUID();

    private final UUID shopId = UUID.randomUUID();

    @BeforeEach
    void stubMembership() {
        stubSellerMembership();
    }

    /** 工作台一行：本表只断言路由与绑定，字段求契约合法 */
    private SellerRefundItem refundItem() {
        return new SellerRefundItem(
                UUID.randomUUID(),
                UUID.randomUUID(),
                "20260101120000002",
                "张三",
                1,
                "测试商品",
                RefundType.RETURN_REFUND,
                RefundStatus.PENDING,
                List.of(RefundAvailableAction.AGREE, RefundAvailableAction.REJECT),
                AfterSaleReason.QUALITY_ISSUE,
                "包装破损",
                false,
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
    class 一页订单的退款动作 { // GET /seller/refunds/actions

        @Test
        void 成员放行_200_orderIds绑定成列表并带上下文店铺() throws Exception {
            UUID orderId = UUID.randomUUID();
            when(refundService.sellerActionsByOrders(eq(shopId), any()))
                    .thenReturn(List.of(new SellerOrderRefundActions(
                            orderId, List.of(RefundAvailableAction.AGREE, RefundAvailableAction.REJECT))));

            mockMvc.perform(sellerGet("/seller/refunds/actions")
                            .param("orderIds", orderId.toString())
                            .param("orderIds", UUID.randomUUID().toString()))
                    .andExpect(status().isOk());

            verify(refundService).sellerActionsByOrders(eq(shopId), argThat(ids -> ids.size() == 2));
        }

        @Test
        void 不传orderIds_400() throws Exception {
            mockMvc.perform(sellerGet("/seller/refunds/actions")).andExpect(status().isBadRequest());
        }

        @Test
        void 批量id超上限_422() throws Exception {
            // 这个入口吃的就是「刚取到的那一页订单」，比一页更宽的请求不是它的用法
            MockHttpServletRequestBuilder request = sellerGet("/seller/refunds/actions");
            for (int i = 0; i <= Quantities.BATCH_IDS_MAX; i++) {
                request.param("orderIds", UUID.randomUUID().toString());
            }
            mockMvc.perform(request).andExpect(status().isUnprocessableEntity());
        }
    }

    @Nested
    class 本店退款单 { // GET /seller/refunds

        @Test
        void 成员放行_200_shopId与筛选值落上下文() throws Exception {
            when(refundService.pageShop(eq(shopId), any(), any()))
                    .thenReturn(new PageResult<>(List.of(refundItem()), 1));

            mockMvc.perform(sellerGet("/seller/refunds")
                            .param("page", "1")
                            .param("size", "10")
                            .param("status", "PENDING"))
                    .andExpect(status().isOk());

            verify(refundService).pageShop(eq(shopId), eq("PENDING"), any());
        }

        @Test
        void 不带status_200_全部不筛() throws Exception {
            when(refundService.pageShop(eq(shopId), any(), any()))
                    .thenReturn(new PageResult<>(List.of(refundItem()), 1));

            mockMvc.perform(sellerGet("/seller/refunds")).andExpect(status().isOk());

            verify(refundService).pageShop(eq(shopId), isNull(), any());
        }

        @Test
        void 缺店铺上下文_403() throws Exception {
            mockMvc.perform(get("/seller/refunds").with(userAuth(userId)))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.detail").value("缺少店铺上下文（X-Shop-Id）"));
        }
    }
}
