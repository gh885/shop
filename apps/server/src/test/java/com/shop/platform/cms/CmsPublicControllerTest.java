package com.shop.platform.cms;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.shop.platform.cms.mapper.Banner;
import com.shop.platform.cms.mapper.NavEntry;
import com.shop.platform.testsupport.WebControllerTestSupport;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/** CMS 前台只读接口契约：匿名可达（首页 SSR loader 并发拉取）、默认参数生效。 */
class CmsPublicControllerTest extends WebControllerTestSupport {

    @Test
    void 导航_默认home键() throws Exception {
        NavEntry entry = new NavEntry();
        entry.setId(UUID.randomUUID());
        entry.setNavKey("home");
        entry.setTitle("手机数码");
        entry.setStatus(1);
        when(contentService.nav("home")).thenReturn(List.of(entry));

        mockMvc.perform(get("/api/cms/nav"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].title").value("手机数码"));

        verify(contentService).nav("home");
    }

    @Test
    void 横幅_默认home_promo位() throws Exception {
        Banner banner = new Banner();
        banner.setId(UUID.randomUUID());
        banner.setSlot("home_promo");
        banner.setTitle("年货节");
        banner.setImageUrl("https://cdn/x.png");
        when(contentService.banners("home_promo")).thenReturn(List.of(banner));

        mockMvc.perform(get("/api/cms/banners"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].title").value("年货节"))
                .andExpect(jsonPath("$[0].imageUrl").value("https://cdn/x.png"));
    }

    @Test
    void 推荐词条_扁平数组() throws Exception {
        com.shop.platform.cms.mapper.RecommendTab tab = new com.shop.platform.cms.mapper.RecommendTab();
        tab.setId(UUID.randomUUID());
        tab.setName("猜你喜欢");
        tab.setIsDefault(true);
        when(contentService.recommendTabs()).thenReturn(List.of(tab));

        mockMvc.perform(get("/api/cms/recommend-tabs"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].name").value("猜你喜欢".replace("欢", "欢")))
                .andExpect(jsonPath("$[0].isDefault").value(true));
    }
}
