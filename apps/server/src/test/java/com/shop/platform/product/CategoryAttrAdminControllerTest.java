package com.shop.platform.product;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.shop.platform.product.mapper.CategoryAttr;
import com.shop.platform.product.mapper.CategoryAttrValue;
import com.shop.platform.product.service.CategoryAttrNode;
import com.shop.platform.testsupport.WebControllerTestSupport;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/** 管理端类目属性模板接口契约：员工令牌守卫、模板查询/建档/改名透传、422 校验。业务规则见 CategoryAttrIT。 */
class CategoryAttrAdminControllerTest extends WebControllerTestSupport {

    private final UUID staffId = UUID.randomUUID();

    private final UUID categoryId = UUID.randomUUID();

    private CategoryAttr attr() {
        return CategoryAttr.builder()
                .id(UUID.randomUUID())
                .categoryId(categoryId)
                .name("颜色")
                .kind(1)
                .required(false)
                .allowCustom(true)
                .sort(0)
                .status(1)
                .build();
    }

    @Test
    void 模板查询_属性加值域() throws Exception {
        CategoryAttr a = attr();
        CategoryAttrValue v = CategoryAttrValue.builder()
                .id(UUID.randomUUID())
                .attrId(a.getId())
                .value("黑")
                .sort(0)
                .source(1)
                .build();
        when(categoryAttrService.listTemplate(categoryId)).thenReturn(List.of(new CategoryAttrNode(a, List.of(v))));

        mockMvc.perform(get("/admin/categories/{id}/attrs", categoryId).with(staffAuth(staffId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].attr.name").value("颜色"))
                .andExpect(jsonPath("$[0].values[0].value").value("黑"));
    }

    @Test
    void 新建属性_缺名字_422() throws Exception {
        mockMvc.perform(post("/admin/categories/{id}/attrs", categoryId)
                        .with(staffAuth(staffId))
                        .content("""
                            {"kind": 1}
                            """))
                .andExpect(status().is(422))
                .andExpect(jsonPath("$.errors[0].field").value("name"));
    }

    @Test
    void 新建属性_kind越界_422() throws Exception {
        mockMvc.perform(
                        post("/admin/categories/{id}/attrs", categoryId)
                                .with(staffAuth(staffId))
                                .content(
                                        """
                            {"name": "颜色", "kind": 3}
                            """))
                .andExpect(status().is(422));
    }

    @Test
    void 改值名_透传改名刷新入口() throws Exception {
        UUID valueId = UUID.randomUUID();
        CategoryAttrValue renamed = CategoryAttrValue.builder()
                .id(valueId)
                .attrId(UUID.randomUUID())
                .value("曜石黑")
                .sort(0)
                .source(1)
                .build();
        when(categoryAttrService.updateValue(eq(valueId), eq("曜石黑"), any())).thenReturn(renamed);

        mockMvc.perform(put("/admin/category-attr-values/{valueId}", valueId)
                        .with(staffAuth(staffId))
                        .content("""
                            {"value": "曜石黑"}
                            """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.value").value("曜石黑"));

        verify(categoryAttrService).updateValue(eq(valueId), eq("曜石黑"), eq(null));
    }

    @Test
    void 属性状态开关_透传() throws Exception {
        UUID attrId = UUID.randomUUID();
        mockMvc.perform(put("/admin/category-attrs/{attrId}/status", attrId)
                        .with(staffAuth(staffId))
                        .content("""
                            {"status": 0}
                            """))
                .andExpect(status().isOk());

        verify(categoryAttrService).updateAttrStatus(attrId, 0);
    }

    @Test
    void 公开模板_匿名可达_仅启用属性() throws Exception {
        CategoryAttr a = attr();
        when(categoryAttrService.publicTemplate(categoryId)).thenReturn(List.of(new CategoryAttrNode(a, List.of())));

        mockMvc.perform(get("/api/categories/{id}/attr-template", categoryId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].attr.name").value("颜色"));
    }
}
