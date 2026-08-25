package com.shop.platform.cart;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.shop.platform.cart.mapper.CartItem;
import com.shop.platform.cart.service.CartCount;
import com.shop.platform.cart.service.CartItemView;
import com.shop.platform.common.Money;
import com.shop.platform.common.UserIdHolder;
import com.shop.platform.testsupport.WebControllerTestSupport;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

/**
 * 购物车接口契约：加购幂等合并、列表视图字段（含失效置灰）、角标计数、
 * 部分更新/批量勾选/批量删的传参透传。业务规则见 CartService 单测与真库链路。
 */
class CartControllerTest extends WebControllerTestSupport {

    private final UUID userId = UUID.randomUUID();

    private final UUID skuId = UUID.randomUUID();

    @AfterEach
    void clearContext() {
        UserIdHolder.clear();
    }

    @Test
    void 加购_201_返回条目() throws Exception {
        when(cartService.add(eq(userId), any()))
                .thenReturn(CartItem.builder()
                        .id(UUID.randomUUID())
                        .userId(userId)
                        .skuId(skuId)
                        .quantity(2)
                        .selected(true)
                        .createdAt(OffsetDateTime.now())
                        .updatedAt(OffsetDateTime.now())
                        .build());

        mockMvc.perform(post("/cart/items")
                        .header("Authorization", "Bearer " + userToken(userId))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(
                                """
                            {"skuId": "%s", "quantity": 2}
                            """
                                        .formatted(skuId)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.skuId").value(skuId.toString()))
                .andExpect(jsonPath("$.quantity").value(2));
    }

    @Test
    void 加购_缺数量_422() throws Exception {
        mockMvc.perform(post("/cart/items")
                        .header("Authorization", "Bearer " + userToken(userId))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                            {"skuId": "%s"}
                            """
                                .formatted(skuId)))
                .andExpect(status().is(422))
                .andExpect(jsonPath("$.errors[0].field").value("quantity"));
    }

    @Test
    void 列表_含商品与SKU拼装视图() throws Exception {
        when(cartService.list(userId))
                .thenReturn(List.of(new CartItemView(
                        UUID.randomUUID(),
                        skuId,
                        1,
                        true,
                        OffsetDateTime.now(),
                        new CartItemView.ProductInfo(UUID.randomUUID(), "测试商品", "p.png", UUID.randomUUID(), "测试店铺"),
                        new CartItemView.SkuInfo(skuId, "黑色 S", null, Money.cny(1000), null, 5, 1),
                        true)));

        mockMvc.perform(get("/cart/items").header("Authorization", "Bearer " + userToken(userId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].product.name").value("测试商品"))
                .andExpect(jsonPath("$[0].sku.price.amount").value(1000))
                .andExpect(jsonPath("$[0].available").value(true));
    }

    @Test
    void 角标计数_免拉整车() throws Exception {
        when(cartService.count(userId)).thenReturn(new CartCount(3, 1));

        mockMvc.perform(get("/cart/count").header("Authorization", "Bearer " + userToken(userId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(3))
                .andExpect(jsonPath("$.selected").value(1));
    }

    @Test
    void 改数量_部分更新() throws Exception {
        UUID itemId = UUID.randomUUID();
        when(cartService.update(eq(userId), eq(itemId), any()))
                .thenReturn(
                        CartItem.builder().id(itemId).skuId(skuId).quantity(5).build());

        mockMvc.perform(put("/cart/items/{id}", itemId)
                        .header("Authorization", "Bearer " + userToken(userId))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                            {"quantity": 5}
                            """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.quantity").value(5));
    }

    @Test
    void 批量勾选_整车全选() throws Exception {
        mockMvc.perform(put("/cart/items/selected")
                        .header("Authorization", "Bearer " + userToken(userId))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                            {"selected": true}
                            """))
                .andExpect(status().isOk());

        verify(cartService).updateSelected(eq(userId), any());
    }

    @Test
    void 删除单条() throws Exception {
        UUID itemId = UUID.randomUUID();
        mockMvc.perform(delete("/cart/items/{id}", itemId).header("Authorization", "Bearer " + userToken(userId)))
                .andExpect(status().isOk());

        verify(cartService).remove(userId, itemId);
    }

    @Test
    void 批量删除_清除失效共用() throws Exception {
        mockMvc.perform(post("/cart/items/batch-delete")
                        .header("Authorization", "Bearer " + userToken(userId))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(
                                """
                            {"itemIds": ["%s", "%s"]}
                            """
                                        .formatted(UUID.randomUUID(), UUID.randomUUID())))
                .andExpect(status().isOk());

        verify(cartService).batchRemove(eq(userId), any());
    }

    @Test
    void 未登录_401() throws Exception {
        mockMvc.perform(get("/cart/items")).andExpect(status().isUnauthorized());
    }
}
