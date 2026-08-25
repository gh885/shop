package com.shop.platform.product;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.shop.platform.common.ShopIdHolder;
import com.shop.platform.inventory.api.StockView;
import com.shop.platform.product.mapper.Product;
import com.shop.platform.product.mapper.Sku;
import com.shop.platform.product.service.ProductDetail;
import com.shop.platform.testsupport.WebControllerTestSupport;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

/**
 * 卖家商品接口契约：X-Shop-Id 成员守卫、草稿全字段出参（含 skuCode/status，与买家侧契约不同）、
 * 规格对账/SKU 批改透传、上下架状态机入口。业务规则见 ProductIT。
 */
class ProductAdminControllerTest extends WebControllerTestSupport {

    private final UUID userId = UUID.randomUUID();

    private final UUID shopId = UUID.randomUUID();

    private final UUID productId = UUID.randomUUID();

    @BeforeEach
    void stubMembership() {
        stubSellerMembership();
    }

    @AfterEach
    void clearContext() {
        ShopIdHolder.clear();
        com.shop.platform.common.UserIdHolder.clear();
    }

    private Product draft() {
        Product p = new Product();
        p.setId(productId);
        p.setShopId(shopId);
        p.setCategoryId(UUID.randomUUID());
        p.setName("卖家商品");
        p.setStatus(2); // 草稿
        return p;
    }

    @Test
    void 创建商品_落店铺上下文() throws Exception {
        when(productService.create(any())).thenReturn(draft());

        mockMvc.perform(post("/seller/products")
                        .header("Authorization", "Bearer " + userToken(userId))
                        .header("X-Shop-Id", shopId.toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(
                                """
                            {"categoryId": "%s", "name": "卖家商品"}
                            """
                                        .formatted(UUID.randomUUID())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("卖家商品"))
                // 草稿期未设价：min/max 为 null 而非 0
                .andExpect(jsonPath("$.minPrice").doesNotExist());

        verify(productService).create(any());
    }

    @Test
    void 改规格_返回SKU列表_卖家可见skuCode() throws Exception {
        Sku sku = new Sku();
        sku.setId(UUID.randomUUID());
        sku.setProductId(productId);
        sku.setSkuCode("SKU-001");
        sku.setName("卖家商品 黑色");
        sku.setPrice(1000L);
        sku.setCurrency("CNY");
        sku.setStatus(1);
        when(productService.updateSpecs(eq(productId), any())).thenReturn(List.of(sku));
        when(stockReadQuery.availableBySkuIds(any())).thenReturn(Map.of());

        mockMvc.perform(
                        put("/seller/products/{id}/specs", productId)
                                .header("Authorization", "Bearer " + userToken(userId))
                                .header("X-Shop-Id", shopId.toString())
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        """
                            {"specs": [{"name": "颜色", "values": ["黑"]}]}
                            """))
                .andExpect(status().isOk())
                // 卖家侧契约：skuCode/status 进出参（仓管编码与停用态），与买家侧刻意不同
                .andExpect(jsonPath("$[0].skuCode").value("SKU-001"))
                .andExpect(jsonPath("$[0].status").value(1));
    }

    @Test
    void 商品详情_SPU加全部SKU() throws Exception {
        Sku sku = new Sku();
        sku.setId(UUID.randomUUID());
        sku.setName("卖家商品 黑色");
        sku.setStatus(1);
        when(productService.detail(productId)).thenReturn(new ProductDetail(draft(), List.of(sku)));
        when(stockReadQuery.availableBySkuIds(any()))
                .thenReturn(Map.of(sku.getId(), new StockView(sku.getId(), 5, 0, 5)));

        mockMvc.perform(get("/seller/products/{id}", productId)
                        .header("Authorization", "Bearer " + userToken(userId))
                        .header("X-Shop-Id", shopId.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.product.name").value("卖家商品"))
                .andExpect(jsonPath("$.skus[0].stock").value(5));
    }

    @Test
    void 发布_复检门槛后上架() throws Exception {
        Product published = draft();
        published.setStatus(1);
        when(productService.publish(productId)).thenReturn(published);

        mockMvc.perform(post("/seller/products/{id}/publish", productId)
                        .header("Authorization", "Bearer " + userToken(userId))
                        .header("X-Shop-Id", shopId.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value(1));
    }

    @Test
    void 下架再上架_状态机入口() throws Exception {
        Product off = draft();
        off.setStatus(0);
        when(productService.off(productId)).thenReturn(off);

        mockMvc.perform(post("/seller/products/{id}/off", productId)
                        .header("Authorization", "Bearer " + userToken(userId))
                        .header("X-Shop-Id", shopId.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value(0));

        verify(productService).off(productId);
    }

    @Test
    void 本店商品列表_按状态筛选() throws Exception {
        when(productService.pageList(eq(shopId), eq(2), any(), anyLong(), anyLong()))
                .thenReturn(new com.shop.platform.common.PageResult<>(List.of(draft()), 1));

        mockMvc.perform(get("/seller/products")
                        .queryParam("page", "1")
                        .queryParam("size", "10")
                        .queryParam("status", "2")
                        .header("Authorization", "Bearer " + userToken(userId))
                        .header("X-Shop-Id", shopId.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.records[0].status").value(2));
    }

    @Test
    void 缺店铺上下文_403() throws Exception {
        mockMvc.perform(get("/seller/products").header("Authorization", "Bearer " + userToken(userId)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.detail").value("缺少店铺上下文（X-Shop-Id）"));
    }
}
