package com.shop.platform.shop;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.shop.platform.shop.mapper.ShopReview;
import com.shop.platform.shop.model.ShopReviewStatus;
import com.shop.platform.testsupport.WebControllerTestSupport;
import java.time.OffsetDateTime;
import java.util.UUID;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

/**
 * 平台审核接口契约。分组 = 接口路径（{@code @Nested} 一层一条路由），方法 = HTTP 语义场景。
 *
 * <p>只断言 HTTP 边界独有的失败面：status、鉴权守卫（401）、请求入参校验（422）、路由与参数绑定（verify）。
 * 审核队列的跨 schema 拼装（店名/店主手机号）与状态机归 service 单测 + 真库链路；响应形状由 OpenAPI→SDK 钉死。
 */
class ReviewControllerTest extends WebControllerTestSupport {

    private final UUID staffId = UUID.randomUUID();

    private final UUID reviewId = UUID.randomUUID();

    private ShopReview decided(ShopReviewStatus status, String reason) {
        ShopReview r = new ShopReview();
        r.setId(reviewId);
        r.setShopId(UUID.randomUUID());
        r.setStaffId(staffId);
        r.setStatus(status);
        r.setReason(reason);
        r.setDecidedAt(OffsetDateTime.now());
        r.setCreatedAt(OffsetDateTime.now());
        r.setUpdatedAt(OffsetDateTime.now());
        return r;
    }

    @Nested
    class 审核队列 { // GET /admin/reviews

        @Test
        void 用户令牌_401() throws Exception {
            mockMvc.perform(get("/admin/reviews").header("Authorization", "Bearer " + userToken(UUID.randomUUID())))
                    .andExpect(status().isUnauthorized());
        }
    }

    @Nested
    class 查看店主电话 { // POST /admin/reviews/{id}/owner-phone

        /** 队列里是掩码，明文只从这一跳出，且带上是哪一个员工索取的（service 侧打点留痕） */
        @Test
        void 返回200_明文带员工身份() throws Exception {
            when(shopReviewService.ownerPhone(reviewId, staffId)).thenReturn("13800001234");

            mockMvc.perform(post("/admin/reviews/{id}/owner-phone", reviewId).with(staffAuth(staffId)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.phone").value("13800001234"));

            verify(shopReviewService).ownerPhone(reviewId, staffId);
        }

        @Test
        void 用户令牌_401() throws Exception {
            mockMvc.perform(post("/admin/reviews/{id}/owner-phone", reviewId)
                            .header("Authorization", "Bearer " + userToken(UUID.randomUUID())))
                    .andExpect(status().isUnauthorized());
        }
    }

    @Nested
    class 审核通过 { // POST /admin/reviews/{id}/approve

        @Test
        void 落员工身份() throws Exception {
            when(shopReviewService.approve(reviewId, staffId)).thenReturn(decided(ShopReviewStatus.APPROVED, null));

            mockMvc.perform(post("/admin/reviews/{id}/approve", reviewId).with(staffAuth(staffId)))
                    .andExpect(status().isOk());

            verify(shopReviewService).approve(reviewId, staffId);
        }
    }

    @Nested
    class 审核拒绝 { // POST /admin/reviews/{id}/reject

        @Test
        void 理由必填_422() throws Exception {
            mockMvc.perform(post("/admin/reviews/{id}/reject", reviewId)
                            .with(staffAuth(staffId))
                            .content("{}"))
                    .andExpect(status().is(422))
                    .andExpect(jsonPath("$.errors[0].field").value("reason"));
        }

        @Test
        void 理由透传() throws Exception {
            when(shopReviewService.reject(reviewId, staffId, "资质不全"))
                    .thenReturn(decided(ShopReviewStatus.REJECTED, "资质不全"));

            mockMvc.perform(
                            post("/admin/reviews/{id}/reject", reviewId)
                                    .with(staffAuth(staffId))
                                    .content(
                                            """
                                {"reason": "资质不全"}
                                """))
                    .andExpect(status().isOk());

            verify(shopReviewService).reject(reviewId, staffId, "资质不全");
        }
    }
}
