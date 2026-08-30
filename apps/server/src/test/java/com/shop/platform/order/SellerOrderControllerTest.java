package com.shop.platform.order;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
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
import org.junit.jupiter.api.Test;

/**
 * 卖家订单接口契约：X-Shop-Id 成员过滤器守卫（缺头 403 / 非成员 403 / 正常放行落上下文）、
 * 本店分页与详情、发货传参。shopId 由过滤器从 header 落 ShopIdHolder，前端不传店 ID。
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
        o.setPayAmount(2000L);
        o.setReceiverName("张三");
        o.setCreatedAt(OffsetDateTime.now());
        return o;
    }

    private org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder sellerGet(
            String path, Object... vars) {
        return get(path, vars).with(userAuth(userId)).header("X-Shop-Id", shopId.toString());
    }

    @Test
    void 本店订单分页_带收货人摘要() throws Exception {
        when(orderService.pageSeller(eq(shopId), any(), any()))
                .thenReturn(new PageResult<>(List.of(new OrderWithItems(paidOrder(), List.of())), 1));

        mockMvc.perform(sellerGet("/seller/orders").param("page", "1").param("size", "10"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.records[0].receiverName").value("张三"))
                .andExpect(jsonPath("$.records[0].itemCount").value(0));
    }

    @Test
    void 订单详情_卖家视角动作集() throws Exception {
        Order order = paidOrder();
        when(orderService.sellerDetail(shopId, order.getId())).thenReturn(new OrderWithItems(order, List.of()));

        mockMvc.perform(sellerGet("/seller/orders/{id}", order.getId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(order.getId().toString()))
                .andExpect(jsonPath("$.availableActions").isArray());

        verify(orderService).sellerDetail(shopId, order.getId());
    }

    @Test
    void 发货_回填物流公司与运单号() throws Exception {
        Order order = paidOrder();
        when(orderService.pageSeller(any(), any(), any())).thenReturn(new PageResult<>(List.of(), 0));

        mockMvc.perform(
                        put("/seller/orders/{id}/ship", order.getId())
                                .with(userAuth(userId))
                                .header("X-Shop-Id", shopId.toString())
                                .content(
                                        """
                            {"logisticsCompany": "顺丰", "trackingNo": "SF123456789"}
                            """))
                .andExpect(status().isOk());

        verify(orderTransitionService).ship(eq(shopId), eq(order.getId()), any());
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
