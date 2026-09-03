package com.shop.platform.product;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.shop.platform.product.mapper.CategoryAttr;
import com.shop.platform.product.mapper.CategoryAttrValue;
import com.shop.platform.product.model.AttrKind;
import com.shop.platform.product.model.AttrValueSource;
import com.shop.platform.product.model.CategoryAttrStatus;
import com.shop.platform.product.service.CategoryAttrNode;
import com.shop.platform.testsupport.WebControllerTestSupport;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

/**
 * 管理端类目属性模板接口契约。分组 = 接口路径（{@code @Nested} 一层一条路由），方法 = HTTP 语义场景。
 *
 * <p>HTTP 独有：请求入参校验（422）、枚举非法（400）、路由与参数绑定（verify）、公开模板匿名可达。
 * 模板查询拼装与状态开关业务规则归 CategoryAttrIT；响应形状由 OpenAPI→SDK 钉死。
 */
class CategoryAttrAdminControllerTest extends WebControllerTestSupport {

    private final UUID staffId = UUID.randomUUID();

    private final UUID categoryId = UUID.randomUUID();

    private CategoryAttr attr() {
        return CategoryAttr.builder()
                .id(UUID.randomUUID())
                .categoryId(categoryId)
                .name("颜色")
                .kind(AttrKind.SPEC)
                .required(false)
                .allowCustom(true)
                .sort(0)
                .status(CategoryAttrStatus.ENABLED)
                .build();
    }

    @Nested
    class 新建属性 { // POST /admin/categories/{id}/attrs

        @Test
        void 缺名字_422() throws Exception {
            mockMvc.perform(
                            post("/admin/categories/{id}/attrs", categoryId)
                                    .with(staffAuth(staffId))
                                    .content(
                                            """
                                {"kind": "SPEC"}
                                """))
                    .andExpect(status().is(422))
                    .andExpect(jsonPath("$.errors[0].field").value("name"));
        }

        @Test
        void kind非法_400() throws Exception {
            mockMvc.perform(
                            post("/admin/categories/{id}/attrs", categoryId)
                                    .with(staffAuth(staffId))
                                    .content(
                                            """
                                {"name": "颜色", "kind": "INVALID"}
                                """))
                    .andExpect(status().is(400));
        }
    }

    @Nested
    class 改值名 { // PUT /admin/category-attr-values/{valueId}

        @Test
        void 透传() throws Exception {
            UUID valueId = UUID.randomUUID();
            when(categoryAttrService.updateValue(eq(valueId), eq("曜石黑"), any(), any()))
                    .thenReturn(CategoryAttrValue.builder()
                            .id(valueId)
                            .attrId(UUID.randomUUID())
                            .value("曜石黑")
                            .sort(0)
                            .source(AttrValueSource.PLATFORM)
                            .build());

            mockMvc.perform(
                            put("/admin/category-attr-values/{valueId}", valueId)
                                    .with(staffAuth(staffId))
                                    .content(
                                            """
                                {"value": "曜石黑"}
                                """))
                    .andExpect(status().isOk());

            verify(categoryAttrService).updateValue(eq(valueId), eq("曜石黑"), isNull(), isNull());
        }
    }

    @Nested
    class 属性状态开关 { // PUT /admin/category-attrs/{attrId}/status

        @Test
        void 透传() throws Exception {
            UUID attrId = UUID.randomUUID();
            mockMvc.perform(
                            put("/admin/category-attrs/{attrId}/status", attrId)
                                    .with(staffAuth(staffId))
                                    .content(
                                            """
                                {"status": "DISABLED"}
                                """))
                    .andExpect(status().isOk());

            verify(categoryAttrService).updateAttrStatus(attrId, CategoryAttrStatus.DISABLED);
        }
    }

    @Nested
    class 公开模板 { // GET /api/categories/{id}/attr-template

        @Test
        void 匿名可达() throws Exception {
            when(categoryAttrService.publicTemplate(categoryId))
                    .thenReturn(List.of(new CategoryAttrNode(attr(), List.of())));

            mockMvc.perform(get("/api/categories/{id}/attr-template", categoryId))
                    .andExpect(status().isOk());

            verify(categoryAttrService).publicTemplate(categoryId);
        }
    }
}
