package com.shop.platform.product;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.shop.platform.product.mapper.Category;
import com.shop.platform.product.model.CategoryStatus;
import com.shop.platform.testsupport.WebControllerTestSupport;
import java.time.OffsetDateTime;
import java.util.UUID;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

/**
 * 管理端类目接口契约。分组 = 接口路径（{@code @Nested} 一层一条路由），方法 = HTTP 语义场景。
 *
 * <p>HTTP 独有：员工令牌守卫（401）、请求入参校验（422）、路由与参数绑定（verify）。
 * 树形结构 & 状态开关业务规则归 CategoryIT；响应形状由 OpenAPI→SDK 钉死。
 */
class CategoryAdminControllerTest extends WebControllerTestSupport {

    private final UUID staffId = UUID.randomUUID();

    private Category category() {
        Category c = new Category();
        c.setId(UUID.randomUUID());
        c.setName("新类目");
        c.setLevel(1);
        c.setSort(99);
        c.setStatus(CategoryStatus.ENABLED);
        c.setCreatedAt(OffsetDateTime.now());
        c.setUpdatedAt(OffsetDateTime.now());
        return c;
    }

    @Nested
    class 类目树 { // GET /admin/categories/tree

        @Test
        void 用户令牌_401() throws Exception {
            mockMvc.perform(get("/admin/categories/tree")
                            .header("Authorization", "Bearer " + userToken(UUID.randomUUID())))
                    .andExpect(status().isUnauthorized());
        }
    }

    @Nested
    class 新建类目 { // POST /admin/categories

        @Test
        void 名字trim透传() throws Exception {
            when(categoryService.create(any(), eq("新类目"), any(), any())).thenReturn(category());

            mockMvc.perform(
                            post("/admin/categories")
                                    .header("Authorization", "Bearer " + staffToken(staffId))
                                    .contentType(MediaType.APPLICATION_JSON)
                                    .content(
                                            """
                                {"name": "新类目", "sort": 99}
                                """))
                    .andExpect(status().isOk());

            verify(categoryService).create(any(), eq("新类目"), eq(99), eq(null));
        }

        @Test
        void 缺名字_422() throws Exception {
            mockMvc.perform(post("/admin/categories")
                            .header("Authorization", "Bearer " + staffToken(staffId))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                {}
                                """))
                    .andExpect(status().is(422))
                    .andExpect(jsonPath("$.errors[0].field").value("name"));
        }
    }

    @Nested
    class 类目变更 { // PUT /admin/categories/{id}

        @Test
        void 改名() throws Exception {
            UUID id = UUID.randomUUID();
            when(categoryService.update(eq(id), eq("改名类目"), any(), any())).thenReturn(category());

            mockMvc.perform(
                            put("/admin/categories/{id}", id)
                                    .header("Authorization", "Bearer " + staffToken(staffId))
                                    .contentType(MediaType.APPLICATION_JSON)
                                    .content(
                                            """
                                {"name": "改名类目"}
                                """))
                    .andExpect(status().isOk());

            verify(categoryService).update(eq(id), eq("改名类目"), any(), any());
        }
    }

    @Nested
    class 状态开关 { // PUT /admin/categories/{id}/status

        @Test
        void 透传() throws Exception {
            UUID id = UUID.randomUUID();

            mockMvc.perform(
                            put("/admin/categories/{id}/status", id)
                                    .header("Authorization", "Bearer " + staffToken(staffId))
                                    .contentType(MediaType.APPLICATION_JSON)
                                    .content(
                                            """
                                {"status": "DISABLED"}
                                """))
                    .andExpect(status().isOk());

            verify(categoryService).updateStatus(id, CategoryStatus.DISABLED);
        }
    }
}
