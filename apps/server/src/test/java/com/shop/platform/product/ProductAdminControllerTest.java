package com.shop.platform.product;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.shop.platform.inventory.api.StockView;
import com.shop.platform.product.mapper.Product;
import com.shop.platform.product.mapper.Sku;
import com.shop.platform.product.model.ProductStatus;
import com.shop.platform.product.model.SkuStatus;
import com.shop.platform.product.service.ProductDetail;
import com.shop.platform.testsupport.WebControllerTestSupport;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

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

    private Product draft() {
        Product p = new Product();
        p.setId(productId);
        p.setShopId(shopId);
        p.setCategoryId(UUID.randomUUID());
        p.setName("卖家商品");
        p.setStatus(ProductStatus.DRAFT); // 草稿
        return p;
    }

    @Test
    void 创建商品_落店铺上下文() throws Exception {
        when(productService.create(any())).thenReturn(draft());

        mockMvc.perform(post("/seller/products")
                        .with(userAuth(userId))
                        .header("X-Shop-Id", shopId.toString())
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
        sku.setStatus(SkuStatus.ON_SALE);
        when(productService.updateSpecs(eq(productId), any())).thenReturn(List.of(sku));
        when(stockReadQuery.availableBySkuIds(any())).thenReturn(Map.of());

        mockMvc.perform(put("/seller/products/{id}/specs", productId)
                        .with(userAuth(userId))
                        .header("X-Shop-Id", shopId.toString())
                        .content(
                                """
                            {"specs": [{"attrId": "%s", "valueIds": ["%s"]}]}
                            """
                                        .formatted(UUID.randomUUID(), UUID.randomUUID())))
                .andExpect(status().isOk())
                // 卖家侧契约：skuCode/status 进出参（仓管编码与停用态），与买家侧刻意不同
                .andExpect(jsonPath("$[0].skuCode").value("SKU-001"))
                .andExpect(jsonPath("$[0].status").value("ON_SALE"));
    }

    @Test
    void 改规格_选择全空_422() throws Exception {
        mockMvc.perform(put("/seller/products/{id}/specs", productId)
                        .with(userAuth(userId))
                        .header("X-Shop-Id", shopId.toString())
                        .content(
                                """
                            {"specs": [{"attrId": "%s"}]}
                            """
                                        .formatted(UUID.randomUUID())))
                .andExpect(status().is(422));
    }

    @Test
    void 商品详情_SPU加全部SKU() throws Exception {
        Sku sku = new Sku();
        sku.setId(UUID.randomUUID());
        sku.setName("卖家商品 黑色");
        sku.setStatus(SkuStatus.ON_SALE);
        when(productService.detail(productId)).thenReturn(new ProductDetail(draft(), List.of(sku)));
        when(stockReadQuery.availableBySkuIds(any()))
                .thenReturn(Map.of(sku.getId(), new StockView(sku.getId(), 5, 0, 5)));

        mockMvc.perform(get("/seller/products/{id}", productId)
                        .with(userAuth(userId))
                        .header("X-Shop-Id", shopId.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.product.name").value("卖家商品"))
                .andExpect(jsonPath("$.skus[0].stock").value(5));
    }

    @Test
    void 发布_复检门槛后上架() throws Exception {
        Product published = draft();
        published.setStatus(ProductStatus.PUBLISHED);
        when(productService.publish(productId)).thenReturn(published);

        mockMvc.perform(post("/seller/products/{id}/publish", productId)
                        .with(userAuth(userId))
                        .header("X-Shop-Id", shopId.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PUBLISHED"));
    }

    @Test
    void 下架再上架_状态机入口() throws Exception {
        Product off = draft();
        off.setStatus(ProductStatus.OFF);
        when(productService.off(productId)).thenReturn(off);

        mockMvc.perform(post("/seller/products/{id}/off", productId)
                        .with(userAuth(userId))
                        .header("X-Shop-Id", shopId.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("OFF"));

        verify(productService).off(productId);
    }

    @Test
    void 本店商品列表_按状态筛选() throws Exception {
        when(productService.pageList(eq(shopId), eq(ProductStatus.DRAFT), any(), anyLong(), anyLong()))
                .thenReturn(new com.shop.platform.common.PageResult<>(List.of(draft()), 1));

        mockMvc.perform(get("/seller/products")
                        .queryParam("page", "1")
                        .queryParam("size", "10")
                        .queryParam("status", "DRAFT")
                        .with(userAuth(userId))
                        .header("X-Shop-Id", shopId.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.records[0].status").value("DRAFT"));
    }

    @Test
    void 缺店铺上下文_403() throws Exception {
        mockMvc.perform(get("/seller/products").with(userAuth(userId)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.detail").value("缺少店铺上下文（X-Shop-Id）"));
    }
}
