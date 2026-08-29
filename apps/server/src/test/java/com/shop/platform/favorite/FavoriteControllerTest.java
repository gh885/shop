package com.shop.platform.favorite;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.shop.platform.common.Money;
import com.shop.platform.favorite.mapper.FavoriteItem;
import com.shop.platform.favorite.service.FavoriteItemView;
import com.shop.platform.testsupport.WebControllerTestSupport;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

/**
 * 收藏夹接口契约：幂等收藏/取消、分页视图（下架置灰）、已收藏子集批查。业务规则见 service 层测试。
 */
class FavoriteControllerTest extends WebControllerTestSupport {

    private final UUID userId = UUID.randomUUID();

    private final UUID productId = UUID.randomUUID();

    @Test
    void 收藏_201_返回收藏行() throws Exception {
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
                        .content("""
                            {"productId": "%s"}
                            """
                                .formatted(productId)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.productId").value(productId.toString()))
                // 契约：不吐 userId（JWT 冗余）
                .andExpect(jsonPath("$.userId").doesNotExist());
    }

    @Test
    void 取消收藏_204幂等() throws Exception {
        mockMvc.perform(delete("/favorites/products/{id}", productId).with(userAuth(userId)))
                .andExpect(status().isNoContent());

        verify(favoriteService).remove(userId, productId);
    }

    @Test
    void 分页列表_含商品卡片与置灰标记() throws Exception {
        when(favoriteService.list(userId, 1, 10))
                .thenReturn(new com.shop.platform.common.PageResult<>(
                        List.of(new FavoriteItemView(
                                UUID.randomUUID(),
                                productId,
                                OffsetDateTime.now(),
                                new FavoriteItemView.ProductInfo(
                                        productId, "收藏商品", "p.png", Money.cny(500), Money.cny(900), 1200L),
                                false)),
                        1));

        mockMvc.perform(get("/favorites")
                        .queryParam("page", "1")
                        .queryParam("size", "10")
                        .with(userAuth(userId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.records[0].product.minPrice.amount").value(500))
                .andExpect(jsonPath("$.records[0].product.collectCount").value(1200))
                .andExpect(jsonPath("$.records[0].available").value(false));
    }

    @Test
    void 已收藏子集_详情页心形状态() throws Exception {
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
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.productIds.length()").value(1))
                .andExpect(jsonPath("$.productIds[0]").value(productId.toString()));
    }

    @Test
    void 未登录_401() throws Exception {
        mockMvc.perform(get("/favorites")).andExpect(status().isUnauthorized());
    }
}
