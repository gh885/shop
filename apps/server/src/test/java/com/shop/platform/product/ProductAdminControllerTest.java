package com.shop.platform.product;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.shop.platform.inventory.api.StockView;
import com.shop.platform.product.mapper.Product;
import com.shop.platform.product.mapper.Sku;
import com.shop.platform.product.model.ProductStatus;
import com.shop.platform.product.model.SkuStatus;
import com.shop.platform.product.service.ProductDetail;
import com.shop.platform.product.service.ProductListRow;
import com.shop.platform.testsupport.WebControllerTestSupport;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

/**
 * 卖家商品接口契约。分组 = 接口路径（{@code @Nested} 一层一条路由），方法 = HTTP 语义场景。
 *
 * <p>HTTP 独有：X-Shop-Id 成员守卫（403）、请求入参校验（422）、出参不吐草稿未定价 minPrice（absence）、
 * 路由与参数绑定（verify）。上下架状态机、规格对账、卖家侧 skuCode/status 契约归 service/ProductIT；
 * 响应形状由 OpenAPI→SDK 钉死。
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

    @Nested
    class 本店商品 { // GET /seller/products

        @Test
        void 列表_按状态筛选() throws Exception {
            when(productQueryService.pageListWithMetrics(
                            eq(shopId), eq(ProductStatus.DRAFT), any(), anyLong(), anyLong(), any()))
                    .thenReturn(
                            new com.shop.platform.common.PageResult<>(List.of(new ProductListRow(draft(), 10, 5L)), 1));

            mockMvc.perform(get("/seller/products")
                            .queryParam("page", "1")
                            .queryParam("size", "10")
                            .queryParam("status", "DRAFT")
                            .with(userAuth(userId))
                            .header("X-Shop-Id", shopId.toString()))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.records[0].stock").value(10))
                    .andExpect(jsonPath("$.records[0].soldCount").value(5));

            verify(productQueryService)
                    .pageListWithMetrics(eq(shopId), eq(ProductStatus.DRAFT), any(), anyLong(), anyLong(), any());
        }

        @Test
        void 缺店铺上下文_403() throws Exception {
            mockMvc.perform(get("/seller/products").with(userAuth(userId)))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.detail").value("缺少店铺上下文（X-Shop-Id）"));
        }
    }

    @Nested
    class 创建商品 { // POST /seller/products

        @Test
        void 落店铺上下文_不吐草稿未定价() throws Exception {
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
                    // 草稿期未设价：min/max 为 null 而非 0
                    .andExpect(jsonPath("$.minPrice").doesNotExist());

            verify(productService).create(any());
        }
    }

    @Nested
    class 商品详情 { // GET /seller/products/{id}

        @Test
        void SPU加全部SKU() throws Exception {
            Sku sku = new Sku();
            sku.setId(UUID.randomUUID());
            sku.setName("卖家商品 黑色");
            sku.setStatus(SkuStatus.ON_SALE);
            when(productQueryService.detail(productId)).thenReturn(new ProductDetail(draft(), List.of(sku)));
            when(stockReadQuery.availableBySkuIds(any()))
                    .thenReturn(Map.of(sku.getId(), new StockView(sku.getId(), 5, 0, 5)));

            mockMvc.perform(get("/seller/products/{id}", productId)
                            .with(userAuth(userId))
                            .header("X-Shop-Id", shopId.toString()))
                    .andExpect(status().isOk());

            verify(productQueryService).detail(productId);
        }
    }

    @Nested
    class 改规格 { // PUT /seller/products/{id}/specs

        @Test
        void 返回SKU列表() throws Exception {
            Sku sku = new Sku();
            sku.setId(UUID.randomUUID());
            sku.setProductId(productId);
            sku.setSkuCode("SKU-001");
            sku.setName("卖家商品 黑色");
            sku.setPrice(1000L);
            sku.setCurrency("CNY");
            sku.setStatus(SkuStatus.ON_SALE);
            when(skuService.updateSpecs(eq(productId), any())).thenReturn(List.of(sku));
            when(stockReadQuery.availableBySkuIds(any())).thenReturn(Map.of());

            mockMvc.perform(put("/seller/products/{id}/specs", productId)
                            .with(userAuth(userId))
                            .header("X-Shop-Id", shopId.toString())
                            .content(
                                    """
                                {"specs": [{"attrId": "%s", "valueIds": ["%s"]}]}
                                """
                                            .formatted(UUID.randomUUID(), UUID.randomUUID())))
                    .andExpect(status().isOk());

            verify(skuService).updateSpecs(eq(productId), any());
        }

        @Test
        void 选择全空_422() throws Exception {
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
    }

    @Nested
    class 商品图上传凭证 { // POST /seller/products/image-ticket

        @Test
        void 缺店铺上下文_403() throws Exception {
            mockMvc.perform(post("/seller/products/image-ticket")
                            .with(userAuth(userId))
                            .param("ext", "png"))
                    .andExpect(status().isForbidden());
        }

        @Test
        void 缺ext_400() throws Exception {
            mockMvc.perform(post("/seller/products/image-ticket")
                            .with(userAuth(userId))
                            .header("X-Shop-Id", shopId.toString()))
                    .andExpect(status().isBadRequest());
        }

        @Test
        void 有ext_按商品图前缀签发() throws Exception {
            when(qiniuClient.issueTicket("product", "jpg"))
                    .thenReturn(new com.shop.platform.infra.qiniu.UploadTicket(
                            "https://up.qiniu", "product/x.jpg", "token", "https://cdn/x.jpg"));

            mockMvc.perform(post("/seller/products/image-ticket")
                            .with(userAuth(userId))
                            .header("X-Shop-Id", shopId.toString())
                            .param("ext", "jpg"))
                    .andExpect(status().isOk());

            verify(qiniuClient).issueTicket("product", "jpg");
        }
    }

    @Nested
    class 商品状态 { // POST /seller/products/{id}/{publish|off}

        @Test
        void 发布() throws Exception {
            Product published = draft();
            published.setStatus(ProductStatus.PUBLISHED);
            // 默认 target=PUBLISHED（立即上架）
            when(productService.publish(productId, ProductStatus.PUBLISHED)).thenReturn(published);

            mockMvc.perform(post("/seller/products/{id}/publish", productId)
                            .with(userAuth(userId))
                            .header("X-Shop-Id", shopId.toString()))
                    .andExpect(status().isOk());

            verify(productService).publish(productId, ProductStatus.PUBLISHED);
        }

        @Test
        void 发布_放入仓库() throws Exception {
            Product stored = draft();
            stored.setStatus(ProductStatus.WAREHOUSE);
            when(productService.publish(productId, ProductStatus.WAREHOUSE)).thenReturn(stored);

            mockMvc.perform(post("/seller/products/{id}/publish", productId)
                            .param("target", "WAREHOUSE")
                            .with(userAuth(userId))
                            .header("X-Shop-Id", shopId.toString()))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.status").value("WAREHOUSE"));

            verify(productService).publish(productId, ProductStatus.WAREHOUSE);
        }

        @Test
        void 下架() throws Exception {
            Product off = draft();
            off.setStatus(ProductStatus.WAREHOUSE);
            when(productService.off(productId)).thenReturn(off);

            mockMvc.perform(post("/seller/products/{id}/off", productId)
                            .with(userAuth(userId))
                            .header("X-Shop-Id", shopId.toString()))
                    .andExpect(status().isOk());

            verify(productService).off(productId);
        }
    }
}
