package com.shop.platform.logistics;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.shop.platform.common.BusinessException;
import com.shop.platform.testsupport.WebControllerTestSupport;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/**
 * 承运商推送端点契约（匿名可达）。HTTP 独有：入参校验、错误码透传、路径变量绑定。
 * 验签与落库归 KdniaoSignTest / TrackingPushServiceTest 与真库 IT。
 */
class CarrierWebhookControllerTest extends WebControllerTestSupport {

    @Nested
    class 接收推送 { // POST /logistics/webhooks/{carrierCode}

        @Test
        void 缺签名_422() throws Exception {
            mockMvc.perform(
                            post("/logistics/webhooks/{carrierCode}", "SF")
                                    .contentType("application/json")
                                    .content(
                                            """
                                {"requestData": "{}"}
                                """))
                    .andExpect(status().isUnprocessableEntity());

            verifyNoInteractions(trackingPushService);
        }

        @Test
        void 签名不合法_透传403() throws Exception {
            // void 方法只能用 doThrow 桩（when(...) 需要返回值）
            doThrow(new BusinessException(403, "签名校验失败"))
                    .when(trackingPushService)
                    .accept(any(), any(), any());

            mockMvc.perform(
                            post("/logistics/webhooks/{carrierCode}", "SF")
                                    .contentType("application/json")
                                    .content(
                                            """
                                {"requestData": "{\\"LogisticCode\\":\\"SF1\\"}", "dataSign": "bad"}
                                """))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.detail").value("签名校验失败"));
        }

        @Test
        void 匿名可达_合法报文_按原样下发给service() throws Exception {
            mockMvc.perform(
                            post("/logistics/webhooks/{carrierCode}", "ZTO")
                                    .contentType("application/json")
                                    .content(
                                            """
                                {"requestData": "{\\"LogisticCode\\":\\"ZTO1\\"}", "dataSign": "ok"}
                                """))
                    .andExpect(status().isOk());

            ArgumentCaptor<String> requestData = ArgumentCaptor.forClass(String.class);
            verify(trackingPushService).accept(eq("ZTO"), requestData.capture(), eq("ok"));
            // 原文一字不改地传下去：验签必须对原始字符串做摘要，重新序列化会因字段顺序差异失配
            assertEquals("{\"LogisticCode\":\"ZTO1\"}", requestData.getValue());
        }
    }
}
