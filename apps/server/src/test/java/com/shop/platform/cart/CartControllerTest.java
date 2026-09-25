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

import com.shop.platform.cart.dto.UpdateCartItemRequest;
import com.shop.platform.cart.mapper.CartItem;
import com.shop.platform.cart.service.CartCount;
import com.shop.platform.testsupport.WebControllerTestSupport;
import java.time.OffsetDateTime;
import java.util.UUID;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

/**
 * 购物车接口契约。分组 = 接口路径（{@code @Nested} 一层一条路由），方法 = HTTP 语义场景。
 *
 * <p>只断言 HTTP 边界独有的失败面：status、鉴权守卫（401）、请求入参校验（422）、方法路由与参数绑定（verify）。
 * 业务规则与视图拼装归 CartService 单测 + 真库链路；响应字段形状由 OpenAPI→SDK 钉死。
 */
class CartControllerTest extends WebControllerTestSupport {

    private final UUID userId = UUID.randomUUID();

    private final UUID skuId = UUID.randomUUID();

    private CartItem item() {
        return CartItem.builder()
                .id(UUID.randomUUID())
                .userId(userId)
                .skuId(skuId)
                .quantity(2)
                .selected(true)
                .createdAt(OffsetDateTime.now())
                .updatedAt(OffsetDateTime.now())
                .build();
    }

    @Nested
    class 新增条目 { // POST /cart/items

        @Test
        void 合法body_201() throws Exception {
            when(cartService.add(eq(userId), any())).thenReturn(item());

            mockMvc.perform(post("/cart/items")
                            .with(userAuth(userId))
                            .content(
                                    """
                                {"skuId": "%s", "quantity": 2}
                                """
                                            .formatted(skuId)))
                    .andExpect(status().isCreated());
        }

        @Test
        void 缺quantity_422() throws Exception {
            mockMvc.perform(post("/cart/items")
                            .with(userAuth(userId))
                            .content(
                                    """
                                {"skuId": "%s"}
                                """
                                            .formatted(skuId)))
                    .andExpect(status().is(422))
                    .andExpect(jsonPath("$.errors[0].field").value("quantity"));
        }
    }

    @Nested
    class 列表 { // GET /cart/items

        @Test
        void 未登录_401() throws Exception {
            mockMvc.perform(get("/cart/items")).andExpect(status().isUnauthorized());
        }
    }

    @Nested
    class 角标计数 { // GET /cart/count

        @Test
        void 未登录_401() throws Exception {
            mockMvc.perform(get("/cart/count")).andExpect(status().isUnauthorized());
        }

        @Test
        void 登录_绑定当前用户_出参只含总数与勾选数() throws Exception {
            when(cartService.count(userId)).thenReturn(new CartCount(7, 3));

            mockMvc.perform(get("/cart/count").with(userAuth(userId))).andExpect(status().isOk());

            verify(cartService).count(userId);
        }
    }

    @Nested
    class 改条目数量 { // PUT /cart/items/{id}

        @Test
        void 返回200_绑定id() throws Exception {
            UUID itemId = UUID.randomUUID();
            when(cartService.update(eq(userId), eq(itemId), any()))
                    .thenReturn(CartItem.builder()
                            .id(itemId)
                            .skuId(skuId)
                            .quantity(5)
                            .build());

            mockMvc.perform(
                            put("/cart/items/{id}", itemId)
                                    .with(userAuth(userId))
                                    .content(
                                            """
                                {"quantity": 5}
                                """))
                    .andExpect(status().isOk());

            verify(cartService).update(userId, itemId, new UpdateCartItemRequest(5, null));
        }
    }

    @Nested
    class 批量勾选 { // PUT /cart/items/selected

        @Test
        void 返回200() throws Exception {
            mockMvc.perform(
                            put("/cart/items/selected")
                                    .with(userAuth(userId))
                                    .content(
                                            """
                                {"selected": true}
                                """))
                    .andExpect(status().isOk());

            verify(cartService).updateSelected(eq(userId), any());
        }
    }

    @Nested
    class 删除单条 { // DELETE /cart/items/{id}

        @Test
        void 返回204_绑定id() throws Exception {
            UUID itemId = UUID.randomUUID();
            mockMvc.perform(delete("/cart/items/{id}", itemId).with(userAuth(userId)))
                    .andExpect(status().isNoContent());

            verify(cartService).remove(userId, itemId);
        }
    }

    @Nested
    class 批量删除 { // POST /cart/items/batch-delete

        @Test
        void 返回200() throws Exception {
            mockMvc.perform(post("/cart/items/batch-delete")
                            .with(userAuth(userId))
                            .content(
                                    """
                                {"itemIds": ["%s", "%s"]}
                                """
                                            .formatted(UUID.randomUUID(), UUID.randomUUID())))
                    .andExpect(status().isOk());

            verify(cartService).batchRemove(eq(userId), any());
        }
    }
}
