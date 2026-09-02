package com.shop.platform.shop;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.shop.platform.shop.mapper.Shop;
import com.shop.platform.shop.model.ShopStatus;
import com.shop.platform.testsupport.WebControllerTestSupport;
import java.time.OffsetDateTime;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/** 店铺公开信息接口契约：匿名可达 + 出参不泄漏内部治理字段（ownerId/status，absence）。 */
class ShopPublicControllerTest extends WebControllerTestSupport {

    @Test
    void 店铺公开信息_匿名可访问_不泄漏治理字段() throws Exception {
        UUID shopId = UUID.randomUUID();
        Shop shop = new Shop();
        shop.setId(shopId);
        shop.setOwnerId(UUID.randomUUID());
        shop.setName("公开店铺");
        shop.setLogoKey("logo.png");
        shop.setStatus(ShopStatus.ACTIVE);
        shop.setCreatedAt(OffsetDateTime.now());
        when(shopService.publicShop(shopId)).thenReturn(shop);

        mockMvc.perform(get("/api/shops/{id}", shopId))
                .andExpect(status().isOk())
                // 契约回归：ownerId 与 status 是内部治理字段，公开出参刻意不含
                .andExpect(jsonPath("$.ownerId").doesNotExist())
                .andExpect(jsonPath("$.status").doesNotExist());

        verify(shopService).publicShop(shopId);
    }
}
