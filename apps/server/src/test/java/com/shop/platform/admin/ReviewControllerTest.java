package com.shop.platform.admin;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.shop.platform.admin.mapper.ShopReview;
import com.shop.platform.admin.model.ShopReviewStatus;
import com.shop.platform.admin.service.ShopReviewItem;
import com.shop.platform.common.PageResult;
import com.shop.platform.testsupport.WebControllerTestSupport;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/**
 * 平台审核接口契约：员工守卫、审核队列分页（跨 schema 拼装店名/店主手机号）、
 * 通过/拒绝透传与拒绝理由必填。状态机见真库链路。
 */
class ReviewControllerTest extends WebControllerTestSupport {

    private final UUID staffId = UUID.randomUUID();

    private final UUID reviewId = UUID.randomUUID();

    private ShopReview review() {
        ShopReview r = new ShopReview();
        r.setId(reviewId);
        r.setShopId(UUID.randomUUID());
        r.setStaffId(staffId);
        r.setStatus(ShopReviewStatus.APPROVED);
        r.setDecidedAt(OffsetDateTime.now());
        r.setCreatedAt(OffsetDateTime.now());
        r.setUpdatedAt(OffsetDateTime.now());
        return r;
    }

    @Test
    void 审核队列_拼装店名与店主手机号() throws Exception {
        when(shopReviewService.pageList(any(), eq("PENDING")))
                .thenReturn(new PageResult<>(
                        List.of(new ShopReviewItem(
                                reviewId,
                                UUID.randomUUID(),
                                "待审店铺",
                                "138****0000",
                                ShopReviewStatus.PENDING,
                                null,
                                null,
                                OffsetDateTime.now())),
                        1));

        mockMvc.perform(get("/admin/reviews").queryParam("status", "PENDING").with(staffAuth(staffId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.records[0].shopName").value("待审店铺"))
                .andExpect(jsonPath("$.records[0].ownerPhone").value("138****0000"))
                .andExpect(jsonPath("$.total").value(1));
    }

    @Test
    void 审核通过_落员工身份() throws Exception {
        when(shopReviewService.approve(reviewId, staffId)).thenReturn(review());

        mockMvc.perform(post("/admin/reviews/{id}/approve", reviewId).with(staffAuth(staffId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value(ShopReviewStatus.APPROVED.name()))
                .andExpect(jsonPath("$.staffId").value(staffId.toString()));

        verify(shopReviewService).approve(reviewId, staffId);
    }

    @Test
    void 审核拒绝_理由必填() throws Exception {
        mockMvc.perform(post("/admin/reviews/{id}/reject", reviewId)
                        .with(staffAuth(staffId))
                        .content("{}"))
                .andExpect(status().is(422))
                .andExpect(jsonPath("$.errors[0].field").value("reason"));
    }

    @Test
    void 审核拒绝_理由留痕() throws Exception {
        when(shopReviewService.reject(eq(reviewId), eq(staffId), eq("资质不全"))).thenAnswer(inv -> {
            ShopReview r = review();
            r.setStatus(ShopReviewStatus.REJECTED);
            r.setReason(inv.getArgument(2));
            return r;
        });

        mockMvc.perform(post("/admin/reviews/{id}/reject", reviewId)
                        .with(staffAuth(staffId))
                        .content("""
                            {"reason": "资质不全"}
                            """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value(ShopReviewStatus.REJECTED.name()))
                .andExpect(jsonPath("$.reason").value("资质不全"));
    }

    @Test
    void 用户令牌访问_401() throws Exception {
        mockMvc.perform(get("/admin/reviews").header("Authorization", "Bearer " + userToken(UUID.randomUUID())))
                .andExpect(status().isUnauthorized());
    }
}
