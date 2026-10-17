package com.shop.platform.logistics;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.shop.platform.logistics.model.ShipmentStatus;
import com.shop.platform.logistics.service.DispatchShipmentCommand;
import com.shop.platform.testsupport.WebControllerTestSupport;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/**
 * 卖家物流接口契约。分组 = 接口路径（一层一条路由），方法 = HTTP 语义场景。
 *
 * <p>HTTP 独有：X-Shop-Id 成员过滤器守卫（缺头 403）、入参校验（422）、路由与参数绑定
 * （verify 落到 service 的 shopId 与承运商/运单号/行项）。业务规则归 ShipmentServiceTest 与真库 IT；
 * 响应形状由 OpenAPI→SDK 钉死。
 */
class SellerLogisticsControllerTest extends WebControllerTestSupport {

    private final UUID userId = UUID.randomUUID();

    private final UUID shopId = UUID.randomUUID();

    private final UUID orderId = UUID.randomUUID();

    private final UUID orderItemId = UUID.randomUUID();

    private final UUID shipmentId = UUID.randomUUID();

    @BeforeEach
    void stubMembership() {
        stubSellerMembership();
    }

    /** 捕获下发给 service 的录单入参（5 个字段，逐字段 eq 太吵） */
    private DispatchShipmentCommand capturedRecord() {
        ArgumentCaptor<DispatchShipmentCommand> captured = ArgumentCaptor.forClass(DispatchShipmentCommand.class);
        verify(shipmentService).record(captured.capture());
        return captured.getValue();
    }

    private String body(String extra) {
        return """
                {"orderId": "%s"%s}
                """.formatted(orderId, extra);
    }

    private String lines() {
        return """
                , "lines": [{"orderItemId": "%s", "quantity": 2}]
                """
                .formatted(orderItemId);
    }

    @Nested
    class 快递公司下拉 { // GET /seller/carriers

        @Test
        void 缺店铺头_403() throws Exception {
            mockMvc.perform(get("/seller/carriers").with(userAuth(userId))).andExpect(status().isForbidden());
        }

        @Test
        void 成员_200() throws Exception {
            when(shipmentService.enabledCarriers()).thenReturn(List.of());

            mockMvc.perform(get("/seller/carriers").with(userAuth(userId)).header("X-Shop-Id", shopId.toString()))
                    .andExpect(status().isOk());

            verify(shipmentService).enabledCarriers();
        }
    }

    @Nested
    class 录单 { // POST /seller/shipments

        @Test
        void 缺carrierCode_422() throws Exception {
            mockMvc.perform(post("/seller/shipments")
                            .with(userAuth(userId))
                            .header("X-Shop-Id", shopId.toString())
                            .content(body(
                                    """
                                    , "trackingNo": "SF123456789"%s
                                    """
                                            .formatted(lines()))))
                    .andExpect(status().isUnprocessableEntity());
        }

        @Test
        void 缺运单号_422() throws Exception {
            mockMvc.perform(post("/seller/shipments")
                            .with(userAuth(userId))
                            .header("X-Shop-Id", shopId.toString())
                            .content(body(
                                    """
                                    , "carrierCode": "SF"%s
                                    """
                                            .formatted(lines()))))
                    .andExpect(status().isUnprocessableEntity());
        }

        /** 行是发货的粒度，空行单没有意义：入口就拒（§4.4 发货单行） */
        @Test
        void 缺行_422() throws Exception {
            mockMvc.perform(
                            post("/seller/shipments")
                                    .with(userAuth(userId))
                                    .header("X-Shop-Id", shopId.toString())
                                    .content(
                                            body(
                                                    """
                                    , "carrierCode": "SF", "trackingNo": "SF123456789"
                                    """)))
                    .andExpect(status().isUnprocessableEntity());
        }

        @Test
        void 合法body_201_返回包裹主键与待发货态() throws Exception {
            when(shipmentService.record(any())).thenReturn(shipmentId);

            mockMvc.perform(post("/seller/shipments")
                            .with(userAuth(userId))
                            .header("X-Shop-Id", shopId.toString())
                            .content(body(
                                    """
                                    , "carrierCode": "SF", "trackingNo": "SF123456789"%s
                                    """
                                            .formatted(lines()))))
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.id").value(shipmentId.toString()))
                    .andExpect(jsonPath("$.status").value(ShipmentStatus.PENDING_DISPATCH.name()));

            DispatchShipmentCommand command = capturedRecord();
            assertEquals(shopId, command.shopId());
            assertEquals(orderId, command.orderId());
            assertEquals("SF", command.carrierCode());
            assertEquals("SF123456789", command.trackingNo());
            assertEquals(1, command.lines().size());
            assertEquals(orderItemId, command.lines().getFirst().orderItemId());
            assertEquals(2, command.lines().getFirst().quantity());
        }
    }

    @Nested
    class 交寄 { // POST /seller/shipments/{id}/dispatch

        @Test
        void 缺店铺头_403() throws Exception {
            mockMvc.perform(post("/seller/shipments/{id}/dispatch", shipmentId).with(userAuth(userId)))
                    .andExpect(status().isForbidden());
        }

        @Test
        void 成员_204_店铺与包裹主键透传() throws Exception {
            mockMvc.perform(post("/seller/shipments/{id}/dispatch", shipmentId)
                            .with(userAuth(userId))
                            .header("X-Shop-Id", shopId.toString()))
                    .andExpect(status().isNoContent());

            verify(shipmentService).dispatch(shopId, shipmentId);
        }
    }

    @Nested
    class 取消 { // POST /seller/shipments/{id}/cancel

        @Test
        void 成员_204_店铺与包裹主键透传() throws Exception {
            mockMvc.perform(post("/seller/shipments/{id}/cancel", shipmentId)
                            .with(userAuth(userId))
                            .header("X-Shop-Id", shopId.toString()))
                    .andExpect(status().isNoContent());

            verify(shipmentService).cancel(shopId, shipmentId);
        }
    }
}
