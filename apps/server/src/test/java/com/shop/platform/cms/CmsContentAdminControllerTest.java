package com.shop.platform.cms;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.shop.platform.cms.mapper.NavEntry;
import com.shop.platform.cms.mapper.RecommendTab;
import com.shop.platform.cms.model.CmsStatus;
import com.shop.platform.testsupport.WebControllerTestSupport;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

/**
 * 管理端 CMS 接口契约。分组 = 接口路径（{@code @Nested} 一层一条路由），方法 = HTTP 语义场景。
 *
 * <p>HTTP 独有：status、鉴权守卫（401）、请求入参校验（422）、路由与参数绑定（verify）。
 * 内容拼装与状态开关归属 service；响应形状由 OpenAPI→SDK 钉死。
 */
class CmsContentAdminControllerTest extends WebControllerTestSupport {

    private final UUID staffId = UUID.randomUUID();

    @Nested
    class 导航 { // GET/POST /admin/cms/nav

        @Test
        void 用户令牌_401() throws Exception {
            mockMvc.perform(get("/admin/cms/nav").header("Authorization", "Bearer " + userToken(UUID.randomUUID())))
                    .andExpect(status().isUnauthorized());
        }

        @Test
        void 匿名_401() throws Exception {
            mockMvc.perform(get("/admin/cms/nav")).andExpect(status().isUnauthorized());
        }

        @Test
        void 全量列表_含停用_透传() throws Exception {
            when(contentService.navAll(null)).thenReturn(List.of());

            mockMvc.perform(get("/admin/cms/nav").with(staffAuth(staffId))).andExpect(status().isOk());

            verify(contentService).navAll(null);
        }

        @Test
        void 新建_透传请求体() throws Exception {
            NavEntry entry = new NavEntry();
            entry.setId(UUID.randomUUID());
            entry.setNavKey("home");
            entry.setTitle("新导航");
            when(contentService.createNav(any())).thenReturn(entry);

            mockMvc.perform(
                            post("/admin/cms/nav")
                                    .with(staffAuth(staffId))
                                    .content(
                                            """
                                {"navKey": "home", "title": "新导航"}
                                """))
                    .andExpect(status().isCreated());

            verify(contentService).createNav(any());
        }

        @Test
        void 新建_缺标题_422() throws Exception {
            mockMvc.perform(
                            post("/admin/cms/nav")
                                    .with(staffAuth(staffId))
                                    .content(
                                            """
                                {"navKey": "home"}
                                """))
                    .andExpect(status().is(422))
                    .andExpect(jsonPath("$.errors[0].field").value("title"));
        }

        @Test
        void 状态开关_路径参数() throws Exception {
            UUID id = UUID.randomUUID();

            mockMvc.perform(put("/admin/cms/nav/{id}/status/{status}", id, "DISABLED")
                            .with(staffAuth(staffId)))
                    .andExpect(status().isOk());

            verify(contentService).setNavStatus(id, CmsStatus.DISABLED);
        }
    }

    @Nested
    class 横幅 { // PUT /admin/cms/banners/{id}/status/{status}

        @Test
        void 状态开关_与生效窗口字段解耦() throws Exception {
            UUID id = UUID.randomUUID();

            mockMvc.perform(put("/admin/cms/banners/{id}/status/{status}", id, "ENABLED")
                            .with(staffAuth(staffId)))
                    .andExpect(status().isOk());

            verify(contentService).setBannerStatus(id, CmsStatus.ENABLED);
        }
    }

    @Nested
    class 推荐条 { // POST /admin/cms/recommend-tabs

        @Test
        void 新建_透传请求体() throws Exception {
            RecommendTab tab = new RecommendTab();
            tab.setId(UUID.randomUUID());
            tab.setName("猜你喜欢");
            tab.setIsDefault(true);
            when(contentService.createTab(any())).thenReturn(tab);

            mockMvc.perform(
                            post("/admin/cms/recommend-tabs")
                                    .with(staffAuth(staffId))
                                    .content(
                                            """
                                {"name": "猜你喜欢"}
                                """))
                    .andExpect(status().isCreated());

            verify(contentService).createTab(any());
        }
    }
}
