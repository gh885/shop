package com.shop.platform.cms;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.shop.platform.testsupport.WebControllerTestSupport;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/**
 * 管理端 CMS 接口契约：/admin/** 仅收员工令牌（用户令牌 401）、导航/banner/推荐条的
 * CRUD 与状态开关透传。鉴权在 StaffAuthFilter，这里验契约与守卫。
 */
class CmsContentAdminControllerTest extends WebControllerTestSupport {

    private final UUID staffId = UUID.randomUUID();

    @Test
    void 用户令牌访问管理端_401() throws Exception {
        mockMvc.perform(get("/admin/cms/nav").header("Authorization", "Bearer " + userToken(UUID.randomUUID())))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void 匿名访问管理端_401() throws Exception {
        mockMvc.perform(get("/admin/cms/nav")).andExpect(status().isUnauthorized());
    }

    @Test
    void 导航全量列表_含停用节点() throws Exception {
        when(contentService.navAll(null)).thenReturn(List.of());

        mockMvc.perform(get("/admin/cms/nav").with(staffAuth(staffId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));

        verify(contentService).navAll(null);
    }

    @Test
    void 新建导航_透传请求体() throws Exception {
        com.shop.platform.cms.mapper.NavEntry entry = new com.shop.platform.cms.mapper.NavEntry();
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
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("新导航"));

        verify(contentService).createNav(any());
    }

    @Test
    void 新建导航_缺标题_422() throws Exception {
        mockMvc.perform(post("/admin/cms/nav")
                        .with(staffAuth(staffId))
                        .content("""
                            {"navKey": "home"}
                            """))
                .andExpect(status().is(422))
                .andExpect(jsonPath("$.errors[0].field").value("title"));
    }

    @Test
    void 导航状态开关_走路径参数() throws Exception {
        UUID id = UUID.randomUUID();

        mockMvc.perform(put("/admin/cms/nav/{id}/status/{status}", id, 0).with(staffAuth(staffId)))
                .andExpect(status().isOk());

        verify(contentService).setNavStatus(id, 0);
    }

    @Test
    void 横幅状态开关_与生效窗口字段解耦() throws Exception {
        UUID id = UUID.randomUUID();

        mockMvc.perform(put("/admin/cms/banners/{id}/status/{status}", id, 1).with(staffAuth(staffId)))
                .andExpect(status().isOk());

        verify(contentService).setBannerStatus(id, 1);
    }

    @Test
    void 推荐条_新建与列表() throws Exception {
        com.shop.platform.cms.mapper.RecommendTab tab = new com.shop.platform.cms.mapper.RecommendTab();
        tab.setId(UUID.randomUUID());
        tab.setName("猜你喜欢");
        tab.setIsDefault(true);
        when(contentService.createTab(any())).thenReturn(tab);
        when(contentService.tabsAll()).thenReturn(List.of(tab));

        mockMvc.perform(post("/admin/cms/recommend-tabs")
                        .with(staffAuth(staffId))
                        .content("""
                            {"name": "猜你喜欢"}
                            """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("猜你喜欢"));

        mockMvc.perform(get("/admin/cms/recommend-tabs").with(staffAuth(staffId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].isDefault").value(true));
    }
}
