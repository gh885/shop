package com.shop.platform.cms;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.shop.platform.cms.mapper.Banner;
import com.shop.platform.cms.mapper.NavEntry;
import com.shop.platform.cms.mapper.RecommendTab;
import com.shop.platform.cms.model.CmsStatus;
import com.shop.platform.testsupport.WebControllerTestSupport;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

/**
 * CMS 前台只读接口契约。分组 = 接口路径（{@code @Nested} 一层一条路由），方法 = HTTP 语义场景。
 *
 * <p>HTTP 独有：匿名可达（无需登录即 200，首页 SSR loader 并发拉取）+ 路由/默认参数绑定（verify）。
 * 内容拼装归 service；响应形状由 OpenAPI→SDK 钉死。
 */
class CmsPublicControllerTest extends WebControllerTestSupport {

    private NavEntry navEntry() {
        NavEntry entry = new NavEntry();
        entry.setId(UUID.randomUUID());
        entry.setNavKey("home");
        entry.setTitle("手机数码");
        entry.setStatus(CmsStatus.ENABLED);
        return entry;
    }

    private Banner banner() {
        Banner banner = new Banner();
        banner.setId(UUID.randomUUID());
        banner.setSlot("home_promo");
        banner.setTitle("年货节");
        banner.setImageUrl("https://cdn/x.png");
        return banner;
    }

    @Nested
    class 导航 { // GET /api/cms/nav

        @Test
        void 匿名可达_默认home键() throws Exception {
            when(contentService.nav("home")).thenReturn(List.of(navEntry()));

            mockMvc.perform(get("/api/cms/nav")).andExpect(status().isOk());

            verify(contentService).nav("home");
        }
    }

    @Nested
    class 横幅 { // GET /api/cms/banners

        @Test
        void 匿名可达_默认home_promo位() throws Exception {
            when(contentService.banners("home_promo")).thenReturn(List.of(banner()));

            mockMvc.perform(get("/api/cms/banners")).andExpect(status().isOk());

            verify(contentService).banners("home_promo");
        }
    }

    @Nested
    class 推荐词条 { // GET /api/cms/recommend-tabs

        @Test
        void 匿名可达() throws Exception {
            RecommendTab tab = new RecommendTab();
            tab.setId(UUID.randomUUID());
            tab.setName("猜你喜欢");
            tab.setIsDefault(true);
            when(contentService.recommendTabs()).thenReturn(List.of(tab));

            mockMvc.perform(get("/api/cms/recommend-tabs")).andExpect(status().isOk());

            verify(contentService).recommendTabs();
        }
    }
}
