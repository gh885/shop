package com.shop.platform.product;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.shop.platform.product.service.CategoryNode;
import com.shop.platform.testsupport.WebControllerTestSupport;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/** 前台类目树接口契约：匿名可达、仅启用节点的树形结构透传。 */
class CategoryControllerTest extends WebControllerTestSupport {

    @Test
    void 公开类目树_匿名可访问_树形嵌套() throws Exception {
        when(categoryService.publicTree())
                .thenReturn(List.of(new CategoryNode(
                        UUID.randomUUID(),
                        null,
                        "手机数码",
                        1,
                        99,
                        1,
                        null,
                        List.of(new CategoryNode(
                                UUID.randomUUID(), UUID.randomUUID(), "手机", 2, 10, 1, null, List.of())))));

        mockMvc.perform(get("/api/categories/tree"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].name").value("手机数码"))
                .andExpect(jsonPath("$[0].children[0].level").value(2));
    }
}
