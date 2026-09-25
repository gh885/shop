package com.shop.platform.product;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.shop.platform.common.BusinessException;
import com.shop.platform.common.PageResult;
import com.shop.platform.inventory.api.StockView;
import com.shop.platform.product.mapper.Product;
import com.shop.platform.product.mapper.Sku;
import com.shop.platform.product.model.ProductStatus;
import com.shop.platform.product.model.SkuStatus;
import com.shop.platform.product.service.ProductDetail;
import com.shop.platform.product.service.PublicProductDetailView;
import com.shop.platform.testsupport.WebControllerTestSupport;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

/**
 * 买家侧商品浏览接口契约。分组 = 接口路径（{@code @Nested} 一层一条路由），方法 = HTTP 语义场景。
 *
 * <p>HTTP 独有：匿名可达、非上架 404 + 错误码、出参不吐内部治理字段（skuCode/status，absence）、
 * 路由与参数绑定（verify）。视图拼装与库存聚合归 service/ProductIT。
 */
class ProductControllerTest extends WebControllerTestSupport {

    private final UUID productId = UUID.randomUUID();

    private final UUID skuId = UUID.randomUUID();

    private Product product() {
        Product p = new Product();
        p.setId(productId);
        p.setShopId(UUID.randomUUID());
        p.setCategoryId(UUID.randomUUID());
        p.setName("测试手机");
        p.setSubtitle("旗舰机");
        p.setMainImage("main.png");
        p.setStatus(ProductStatus.PUBLISHED);
        return p;
    }

    private Sku sku() {
        Sku s = new Sku();
        s.setId(skuId);
        s.setProductId(productId);
        s.setName("测试手机 黑色 S");
        s.setPrice(1000L);
        s.setOriginalPrice(1200L);
        s.setCurrency("CNY");
        s.setStatus(SkuStatus.ON_SALE);
        return s;
    }

    @Nested
    class 商品列表 { // GET /api/products

        @Test
        void 匿名可访问() throws Exception {
            when(productQueryService.pagePublic(any(), anyLong(), anyLong()))
                    .thenReturn(new PageResult<>(List.of(product()), 1));

            mockMvc.perform(get("/api/products")).andExpect(status().isOk());

            verify(productQueryService).pagePublic(any(), anyLong(), anyLong());
        }

        /**
         * 非法 sort 的落点：形状门在 DTO 的 {@code @Pattern} 上，属 GEN-19 第①条线（422 + {@code errors[]}），
         * 不是 service 层自判的 400（那条线归订单/售后/审核筛）。此前注释与规则清单都写「400」，无人验证过。
         */
        @Test
        void 非法排序_422带字段名() throws Exception {
            mockMvc.perform(get("/api/products").param("sort", "sales_desc"))
                    .andExpect(status().isUnprocessableEntity())
                    .andExpect(jsonPath("$.errors[0].field").value("sort"))
                    .andExpect(jsonPath("$.errors[0].message").value("排序方式不支持"));

            verify(productQueryService, never()).pagePublic(any(), anyLong(), anyLong());
        }
    }

    @Nested
    class 商品详情 { // GET /api/products/{id}

        /** 出参由 {@code ProductQueryService} 装配（含跨模块库存），本组只测 HTTP 边界：不吐仓管字段、非上架 404。 */
        @Test
        void 不吐仓管字段() throws Exception {
            ProductDetail detail = new ProductDetail(product(), List.of(sku()));
            when(productQueryService.publicDetailView(productId))
                    .thenReturn(PublicProductDetailView.from(detail, Map.of(skuId, new StockView(skuId, 5, 3))));

            mockMvc.perform(get("/api/products/{id}", productId))
                    .andExpect(status().isOk())
                    // 契约回归：skuCode 是仓管编码，status 恒为在售——都不进买家契约
                    .andExpect(jsonPath("$.skus[0].skuCode").doesNotExist())
                    .andExpect(jsonPath("$.skus[0].status").doesNotExist());

            verify(productQueryService).publicDetailView(productId);
        }

        @Test
        void 非上架_404() throws Exception {
            when(productQueryService.publicDetailView(productId))
                    .thenThrow(new BusinessException(404, "PRODUCT_NOT_FOUND", "商品不存在或未上架"));

            mockMvc.perform(get("/api/products/{id}", productId))
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.code").value("PRODUCT_NOT_FOUND"));
        }
    }
}
