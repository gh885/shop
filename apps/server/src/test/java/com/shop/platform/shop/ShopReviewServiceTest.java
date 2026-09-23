package com.shop.platform.shop;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.when;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.shop.platform.account.api.UserReadQuery;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.PageParams;
import com.shop.platform.shop.mapper.Shop;
import com.shop.platform.shop.mapper.ShopMapper;
import com.shop.platform.shop.mapper.ShopReview;
import com.shop.platform.shop.mapper.ShopReviewMapper;
import com.shop.platform.shop.model.ShopReviewStatus;
import com.shop.platform.shop.model.ShopStatus;
import com.shop.platform.shop.service.ShopReviewItem;
import com.shop.platform.shop.service.ShopReviewService;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;

/**
 * 审核队列号码可见性单测（GEN-51，与 ORD-62 同口径）：队列出参恒掩码 + 明文逐条索取的闸门。
 *
 * <p>审批状态机与「驳回连带级联下架」归 {@code ShopGovernanceIT} / {@code ShopSuspensionIT} 的真库链路，
 * 这里只钉号码这一件事。
 */
@ExtendWith(MockitoExtension.class)
class ShopReviewServiceTest {

    private final UUID reviewId = UUID.randomUUID();

    private final UUID shopId = UUID.randomUUID();

    private final UUID ownerId = UUID.randomUUID();

    @Mock
    private ShopReviewMapper shopReviewMapper;

    @Mock
    private ShopMapper shopMapper;

    @Mock
    private UserReadQuery userReadQuery;

    @Mock
    private ApplicationEventPublisher events;

    @InjectMocks
    private ShopReviewService shopReviewService;

    private ShopReview pendingReview() {
        return ShopReview.builder()
                .id(reviewId)
                .shopId(shopId)
                .status(ShopReviewStatus.PENDING)
                .build();
    }

    private Shop shop() {
        return Shop.builder()
                .id(shopId)
                .ownerId(ownerId)
                .name("测试店")
                .status(ShopStatus.PENDING_REVIEW)
                .build();
    }

    @Nested
    class 队列出参号码 { // GET /admin/reviews

        /** 队列是批量出口：一屏待审店不该连着一屏店主号码，一律掩码（明文另有逐条索取那一跳） */
        @Test
        void 恒为掩码() {
            Page<ShopReview> page = new Page<>(1, 10);
            page.setRecords(List.of(pendingReview()));
            page.setTotal(1);
            when(shopReviewMapper.selectPage(any(), any())).thenReturn(page);
            when(shopMapper.selectBatchIds(anyList())).thenReturn(List.of(shop()));
            when(userReadQuery.phonesByIds(anyList())).thenReturn(Map.of(ownerId, "13800001234"));

            List<ShopReviewItem> items =
                    shopReviewService.pageList(new PageParams(1, 10), null).records();

            assertThat(items).extracting(ShopReviewItem::ownerPhone).containsExactly("138****1234");
        }
    }

    @Nested
    class 查看店主号码明文 { // POST /admin/reviews/{id}/owner-phone

        @Test
        void 返回明文() {
            when(shopReviewMapper.selectById(reviewId)).thenReturn(pendingReview());
            when(shopMapper.selectById(shopId)).thenReturn(shop());
            when(userReadQuery.phoneById(ownerId)).thenReturn(Optional.of("13800001234"));

            assertThat(shopReviewService.ownerPhone(reviewId, UUID.randomUUID()))
                    .isEqualTo("13800001234");
        }

        @Test
        void 审核记录不存在_404() {
            when(shopReviewMapper.selectById(reviewId)).thenReturn(null);

            assertThatThrownBy(() -> shopReviewService.ownerPhone(reviewId, UUID.randomUUID()))
                    .isInstanceOfSatisfying(BusinessException.class, e -> assertThat(e.getHttpStatus())
                            .isEqualTo(404));
        }

        /** 店主账号已被注销清掉：给 404 而不是把 null 当号码吐出去 */
        @Test
        void 店主账号缺席_404() {
            when(shopReviewMapper.selectById(reviewId)).thenReturn(pendingReview());
            when(shopMapper.selectById(shopId)).thenReturn(shop());
            when(userReadQuery.phoneById(ownerId)).thenReturn(Optional.empty());

            assertThatThrownBy(() -> shopReviewService.ownerPhone(reviewId, UUID.randomUUID()))
                    .isInstanceOfSatisfying(BusinessException.class, e -> assertThat(e.getHttpStatus())
                            .isEqualTo(404));
        }
    }

    @Nested
    class 队列状态筛选 {

        /** 这一格钉的是 500 → 400：筛选值写错是调用方的错，不该变成服务端异常 */
        @Test
        void 非法筛选值_400() {
            assertThatThrownBy(() -> shopReviewService.pageList(new PageParams(1, 20), "BOGUS"))
                    .isInstanceOfSatisfying(BusinessException.class, e -> {
                        assertThat(e.getHttpStatus()).isEqualTo(400);
                        assertThat(e.getDetail()).isEqualTo("非法的审核状态筛选值");
                    });
        }
    }
}
