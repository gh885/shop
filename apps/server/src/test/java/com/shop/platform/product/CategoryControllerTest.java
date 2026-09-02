package com.shop.platform.product;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.shop.platform.product.model.CategoryStatus;
import com.shop.platform.product.service.CategoryNode;
import com.shop.platform.testsupport.WebControllerTestSupport;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/** 前台类目树接口契约：匿名可达（首页 SSR 拉取无需登录）+ 仅启用节点透传。树形结构归 service/CategoryIT。 */
class CategoryControllerTest extends WebControllerTestSupport {

    @Test
    void 公开类目树_匿名可访问() throws Exception {
        when(categoryService.publicTree())
                .thenReturn(List.of(new CategoryNode(
                        UUID.randomUUID(),
                        null,
                        "手机数码",
                        1,
                        99,
                        CategoryStatus.ENABLED,
                        null,
                        List.of(new CategoryNode(
                                UUID.randomUUID(), null, "手机", 2, 10, CategoryStatus.ENABLED, null, List.of())))));

        mockMvc.perform(get("/api/categories/tree")).andExpect(status().isOk());

        verify(categoryService).publicTree();
    }
}
