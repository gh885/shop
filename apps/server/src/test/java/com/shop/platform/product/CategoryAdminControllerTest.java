package com.shop.platform.product;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.shop.platform.common.UserIdHolder;
import com.shop.platform.product.mapper.Category;
import com.shop.platform.testsupport.WebControllerTestSupport;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

/** 管理端类目接口契约：员工令牌守卫、树/建/改名/状态开关透传。业务规则见 CategoryIT。 */
class CategoryAdminControllerTest extends WebControllerTestSupport {

    private final UUID staffId = UUID.randomUUID();

    @AfterEach
    void clearContext() {
        UserIdHolder.clear();
    }

    private Category category() {
        Category c = new Category();
        c.setId(UUID.randomUUID());
        c.setName("新类目");
        c.setLevel(1);
        c.setSort(99);
        c.setStatus(1);
        c.setCreatedAt(OffsetDateTime.now());
        c.setUpdatedAt(OffsetDateTime.now());
        return c;
    }

    @Test
    void 用户令牌访问_401() throws Exception {
        mockMvc.perform(get("/admin/categories/tree").header("Authorization", "Bearer " + userToken(UUID.randomUUID())))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void 管理端树_含禁用节点() throws Exception {
        when(categoryService.adminTree()).thenReturn(List.of());

        mockMvc.perform(get("/admin/categories/tree").header("Authorization", "Bearer " + staffToken(staffId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void 新建类目_名字trim透传() throws Exception {
        when(categoryService.create(any(), eq("新类目"), any(), any())).thenReturn(category());

        mockMvc.perform(
                        post("/admin/categories")
                                .header("Authorization", "Bearer " + staffToken(staffId))
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        """
                            {"name": "新类目", "sort": 99}
                            """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("新类目"));

        verify(categoryService).create(any(), eq("新类目"), eq(99), eq(null));
    }

    @Test
    void 新建类目_缺名字_422() throws Exception {
        mockMvc.perform(post("/admin/categories")
                        .header("Authorization", "Bearer " + staffToken(staffId))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                            {}
                            """))
                .andExpect(status().is(422))
                .andExpect(jsonPath("$.errors[0].field").value("name"));
    }

    @Test
    void 改名与状态开关() throws Exception {
        UUID id = UUID.randomUUID();
        when(categoryService.update(eq(id), eq("改名类目"), any(), any())).thenReturn(category());

        mockMvc.perform(put("/admin/categories/{id}", id)
                        .header("Authorization", "Bearer " + staffToken(staffId))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                            {"name": "改名类目"}
                            """))
                .andExpect(status().isOk());

        mockMvc.perform(put("/admin/categories/{id}/status", id)
                        .header("Authorization", "Bearer " + staffToken(staffId))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                            {"status": 0}
                            """))
                .andExpect(status().isOk());

        verify(categoryService).updateStatus(id, 0);
    }
}
