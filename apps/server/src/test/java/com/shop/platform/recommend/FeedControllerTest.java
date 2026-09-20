package com.shop.platform.recommend;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.shop.platform.common.BusinessException;
import com.shop.platform.recommend.dto.FeedQuery;
import com.shop.platform.recommend.service.FeedPage;
import com.shop.platform.testsupport.WebControllerTestSupport;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/**
 * GET /api/feed 的接口契约：匿名可达、size 边界 422、非法游标 400 透传、查询参数绑定与默认值。
 *
 * <p>业务规则（翻页不重不漏、子树命中、销量）归 {@link FeedIT}，这里只钉 HTTP 边界独有的失败面。
 */
class FeedControllerTest extends WebControllerTestSupport {

    private static final String CURSOR = "0011223344556677.01900000-0000-7000-8000-000000000301";

    @Nested
    class 首页Feed { // GET /api/feed

        @Test
        void 匿名可达_200() throws Exception {
            when(feedService.page(any())).thenReturn(new FeedPage(List.of(), null));

            mockMvc.perform(get("/api/feed")).andExpect(status().isOk());

            verify(feedService).page(any(FeedQuery.class));
        }

        @Test
        void 参数绑定_categoryId与cursor透传_size默认24() throws Exception {
            when(feedService.page(any())).thenReturn(new FeedPage(List.of(), null));
            UUID categoryId = UUID.randomUUID();

            mockMvc.perform(get("/api/feed")
                            .param("categoryId", categoryId.toString())
                            .param("cursor", CURSOR))
                    .andExpect(status().isOk());

            ArgumentCaptor<FeedQuery> captor = ArgumentCaptor.forClass(FeedQuery.class);
            verify(feedService).page(captor.capture());
            assertEquals(categoryId, captor.getValue().categoryId());
            assertEquals(CURSOR, captor.getValue().cursor());
            assertEquals(24, captor.getValue().size());
        }

        @Test
        void size超上限_422() throws Exception {
            mockMvc.perform(get("/api/feed").param("size", "49")).andExpect(status().isUnprocessableEntity());
        }

        @Test
        void 非法游标_400() throws Exception {
            when(feedService.page(any())).thenThrow(BusinessException.badRequest("游标不合法"));

            mockMvc.perform(get("/api/feed").param("cursor", "bad")).andExpect(status().isBadRequest());
        }
    }
}
