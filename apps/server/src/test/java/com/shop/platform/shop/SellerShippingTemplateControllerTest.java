package com.shop.platform.shop;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.shop.platform.common.BusinessException;
import com.shop.platform.shop.dto.ShippingTemplateRequest;
import com.shop.platform.shop.mapper.ShippingRule;
import com.shop.platform.shop.mapper.ShippingTemplate;
import com.shop.platform.shop.service.ShippingPricing;
import com.shop.platform.testsupport.WebControllerTestSupport;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/**
 * 卖家运费模板接口契约。分组 = 接口路径（一层一条路由），方法 = HTTP 语义场景。
 *
 * <p>HTTP 独有：X-Shop-Id 成员过滤器守卫（缺头 403）、未登录 401、service 的 404 透传、
 * 入参校验（422）、路由与参数绑定（verify 落到 service 的 shopId 与整份入参）。
 * 计费规则归 ShippingFeeCalculatorTest，模板重建归 ShippingTemplateIT，响应形状由 OpenAPI→SDK 钉死。
 */
class SellerShippingTemplateControllerTest extends WebControllerTestSupport {

    private final UUID userId = UUID.randomUUID();

    private final UUID shopId = UUID.randomUUID();

    @BeforeEach
    void stubMembership() {
        stubSellerMembership();
    }

    /** 一份最小可用的 service 出参（controller 只做形状转换，内容不是本测试的断言对象） */
    private ShippingPricing pricing() {
        return new ShippingPricing(
                ShippingTemplate.builder().id(UUID.randomUUID()).shopId(shopId).build(),
                ShippingRule.builder()
                        .id(UUID.randomUUID())
                        .isDefault(true)
                        .firstQuantity(1)
                        .firstFee(1000L)
                        .addQuantity(1)
                        .addFee(500L)
                        .build(),
                List.of(),
                List.of());
    }

    @Nested
    class 查询运费模板 { // GET /seller/shipping-template

        @Test
        void 未登录_401() throws Exception {
            mockMvc.perform(get("/seller/shipping-template")).andExpect(status().isUnauthorized());
        }

        @Test
        void 缺店铺头_403() throws Exception {
            mockMvc.perform(get("/seller/shipping-template").with(userAuth(userId)))
                    .andExpect(status().isForbidden());
        }

        @Test
        void 未设置模板_service的404透传() throws Exception {
            when(shippingTemplateService.require(any())).thenThrow(BusinessException.notFound("运费模板未设置"));

            mockMvc.perform(get("/seller/shipping-template")
                            .with(userAuth(userId))
                            .header("X-Shop-Id", shopId.toString()))
                    .andExpect(status().isNotFound());
        }

        @Test
        void 成员_200_店铺上下文绑定到service() throws Exception {
            when(shippingTemplateService.require(shopId)).thenReturn(pricing());

            mockMvc.perform(get("/seller/shipping-template")
                            .with(userAuth(userId))
                            .header("X-Shop-Id", shopId.toString()))
                    .andExpect(status().isOk());

            verify(shippingTemplateService).require(shopId);
        }
    }

    @Nested
    class 保存运费模板 { // PUT /seller/shipping-template

        private static final String VALID_BODY =
                """
                {
                  "freeShipping": false,
                  "freeOverQuantity": 3,
                  "defaultRule": {"firstQuantity": 1, "firstFee": 1000, "addQuantity": 1, "addFee": 500},
                  "regionRules": [
                    {"regionPrefixes": ["4403"], "firstQuantity": 1, "firstFee": 2000, "addQuantity": 1, "addFee": 800}
                  ],
                  "excludedRegions": ["65"]
                }
                """;

        @Test
        void 缺店铺头_403() throws Exception {
            mockMvc.perform(put("/seller/shipping-template")
                            .with(userAuth(userId))
                            .content(VALID_BODY))
                    .andExpect(status().isForbidden());
        }

        @Test
        void 缺默认规则_422() throws Exception {
            mockMvc.perform(
                            put("/seller/shipping-template")
                                    .with(userAuth(userId))
                                    .header("X-Shop-Id", shopId.toString())
                                    .content(
                                            """
                                    {"freeShipping": false}
                                    """))
                    .andExpect(status().isUnprocessableEntity());
        }

        @Test
        void 首件为0_422() throws Exception {
            mockMvc.perform(
                            put("/seller/shipping-template")
                                    .with(userAuth(userId))
                                    .header("X-Shop-Id", shopId.toString())
                                    .content(
                                            """
                                    {"freeShipping": false,
                                     "defaultRule": {"firstQuantity": 0, "firstFee": 1000, "addQuantity": 1, "addFee": 500}}
                                    """))
                    .andExpect(status().isUnprocessableEntity());
        }

        @Test
        void 指定地区规则缺区域_422() throws Exception {
            mockMvc.perform(
                            put("/seller/shipping-template")
                                    .with(userAuth(userId))
                                    .header("X-Shop-Id", shopId.toString())
                                    .content(
                                            """
                                    {"freeShipping": false,
                                     "defaultRule": {"firstQuantity": 1, "firstFee": 1000, "addQuantity": 1, "addFee": 500},
                                     "regionRules": [
                                       {"regionPrefixes": [], "firstQuantity": 1, "firstFee": 2000, "addQuantity": 1, "addFee": 800}
                                     ]}
                                    """))
                    .andExpect(status().isUnprocessableEntity());
        }

        @Test
        void 合法body_200_整份入参与店铺上下文透传() throws Exception {
            when(shippingTemplateService.save(any(), any())).thenReturn(pricing());

            mockMvc.perform(put("/seller/shipping-template")
                            .with(userAuth(userId))
                            .header("X-Shop-Id", shopId.toString())
                            .content(VALID_BODY))
                    .andExpect(status().isOk());

            ArgumentCaptor<ShippingTemplateRequest> captured = ArgumentCaptor.forClass(ShippingTemplateRequest.class);
            verify(shippingTemplateService).save(org.mockito.ArgumentMatchers.eq(shopId), captured.capture());
            ShippingTemplateRequest req = captured.getValue();
            assertEquals(3, req.freeOverQuantity().intValue());
            assertEquals(1000L, req.defaultRule().firstFee().longValue());
            assertEquals(List.of("4403"), req.regionRules().getFirst().regionPrefixes());
            assertEquals(List.of("65"), req.excludedRegions());
        }
    }
}
