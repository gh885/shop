package com.shop.platform.favorite;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.shop.platform.favorite.mapper.FavoriteItem;
import com.shop.platform.testsupport.WebControllerTestSupport;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

/**
 * 收藏夹接口契约。分组 = 接口路径（{@code @Nested} 一层一条路由），方法 = HTTP 语义场景。
 *
 * <p>HTTP 独有：创建语义（201）、幂等删除（204）、鉴权守卫（401）、出参不吐冗余 userId（absence）、
 * 路由与参数绑定（verify）。分页视图拼装（下架置灰/Money）归 service；响应形状由 OpenAPI→SDK 钉死。
 *
 * <p>批量收藏状态（{@code POST /favorites/exists}）是详情页心形状态的数据来源：入参是候选 ID 集合，
 * 出参是已收藏子集，空集合属校验错误而非空结果。
 */
class FavoriteControllerTest extends WebControllerTestSupport {

    private final UUID userId = UUID.randomUUID();

    private final UUID productId = UUID.randomUUID();

    @Nested
    class 收藏 { // POST /favorites

        @Test
        void 成功_201_且不吐冗余userId() throws Exception {
            when(favoriteService.add(eq(userId), eq(productId)))
                    .thenReturn(FavoriteItem.builder()
                            .id(UUID.randomUUID())
                            .userId(userId)
                            .productId(productId)
                            .createdAt(OffsetDateTime.now())
                            .build());

            mockMvc.perform(post("/favorites")
                            .with(userAuth(userId))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(
                                    """
                                {"productId": "%s"}
                                """
                                            .formatted(productId)))
                    .andExpect(status().isCreated())
                    // 契约：不吐 userId（JWT 冗余）
                    .andExpect(jsonPath("$.userId").doesNotExist());

            verify(favoriteService).add(userId, productId);
        }
    }

    @Nested
    class 取消收藏 { // DELETE /favorites/products/{id}

        @Test
        void 成功_204幂等() throws Exception {
            mockMvc.perform(delete("/favorites/products/{id}", productId).with(userAuth(userId)))
                    .andExpect(status().isNoContent());

            verify(favoriteService).remove(userId, productId);
        }
    }

    @Nested
    class 批量收藏状态 { // POST /favorites/exists

        @Test
        void 未登录_401() throws Exception {
            mockMvc.perform(post("/favorites/exists")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(
                                    """
                                {"productIds": ["%s"]}
                                """
                                            .formatted(productId)))
                    .andExpect(status().isUnauthorized());
        }

        @Test
        void 空集合_422() throws Exception {
            mockMvc.perform(
                            post("/favorites/exists")
                                    .with(userAuth(userId))
                                    .contentType(MediaType.APPLICATION_JSON)
                                    .content(
                                            """
                                {"productIds": []}
                                """))
                    .andExpect(status().is(422))
                    .andExpect(jsonPath("$.errors[0].field").value("productIds"));
        }

        @Test
        void 绑定当前用户与候选集合() throws Exception {
            UUID other = UUID.randomUUID();
            when(favoriteService.favoritedProductIds(userId, List.of(productId, other)))
                    .thenReturn(List.of(productId));

            mockMvc.perform(post("/favorites/exists")
                            .with(userAuth(userId))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(
                                    """
                                {"productIds": ["%s", "%s"]}
                                """
                                            .formatted(productId, other)))
                    .andExpect(status().isOk());

            verify(favoriteService).favoritedProductIds(userId, List.of(productId, other));
        }
    }

    @Nested
    class 收藏列表 { // GET /favorites

        @Test
        void 未登录_401() throws Exception {
            mockMvc.perform(get("/favorites")).andExpect(status().isUnauthorized());
        }
    }
}
