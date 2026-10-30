package com.shop.telemetry.sdk.spring;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.servlet.HandlerMapping;

class RouteTemplatesTest {

    @Test
    void prefersSpringsMatchedPattern() {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/orders/8821");
        request.setAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE, "/api/orders/{id}");

        assertEquals("POST /api/orders/{id}", RouteTemplates.of(request));
    }

    /** 拿不到模板时兜底净化：数字段与 UUID 段必须被吃掉，否则每个订单号一条 transaction。 */
    @Test
    void sanitizesNumericAndUuidSegments() {
        assertEquals("/api/orders/:id", RouteTemplates.sanitize("/api/orders/8821"));
        assertEquals(
                "/api/shops/:id/goods/:id",
                RouteTemplates.sanitize("/api/shops/12/goods/7c9e6679-b1a2-4a3f-8e5d-0c1b2a394857"));
        assertEquals(
                "/api/shops/:id/goods/:id",
                RouteTemplates.sanitize("/api/shops/12/goods/7c9e6679b1a24a3f8e5d0c1b2a394857"));
    }

    @Test
    void keepsNonIdentifierSegments() {
        assertEquals("/api/orders", RouteTemplates.sanitize("/api/orders"));
        assertEquals("/", RouteTemplates.sanitize(""));
        // 纯字母但长度不对的段不是 id，不能误伤（否则 /api/health/abc 会变成 /api/health/:id）
        assertEquals("/api/health/abc", RouteTemplates.sanitize("/api/health/abc"));
    }
}
