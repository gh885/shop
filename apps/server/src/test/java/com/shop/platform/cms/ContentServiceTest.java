package com.shop.platform.cms;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.shop.platform.cms.dto.BannerRequest;
import com.shop.platform.cms.dto.NavRequest;
import com.shop.platform.cms.dto.RecommendTabRequest;
import com.shop.platform.cms.mapper.Banner;
import com.shop.platform.cms.mapper.BannerMapper;
import com.shop.platform.cms.mapper.NavEntry;
import com.shop.platform.cms.mapper.NavEntryMapper;
import com.shop.platform.cms.mapper.RecommendTab;
import com.shop.platform.cms.mapper.RecommendTabMapper;
import com.shop.platform.cms.model.CmsStatus;
import com.shop.platform.cms.service.ContentService;
import com.shop.platform.common.BusinessException;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DuplicateKeyException;

/**
 * CMS 内容写入口的业务规则单测（mock mapper，不碰库）：banner 生效窗口自洽、
 * update 家族「null 字段不覆写为 0/false」的透传语义、默认词条撞唯一索引转 409 的映射。
 *
 * <p>NOT_NULL 策略真正跳过null列、部分唯一索引 uk_recommend_tabs_default 拦双默认，
 * 是 MyBatis-Plus / DB 侧语义，mock 掉 mapper 测不到，归 {@code RecommendTabDefaultIT} 真库覆盖。
 */
@ExtendWith(MockitoExtension.class)
class ContentServiceTest {

    @Mock
    private NavEntryMapper navEntryMapper;

    @Mock
    private BannerMapper bannerMapper;

    @Mock
    private RecommendTabMapper recommendTabMapper;

    @InjectMocks
    private ContentService service;

    private static OffsetDateTime at(int month, int day) {
        return OffsetDateTime.of(2026, month, day, 0, 0, 0, 0, ZoneOffset.UTC);
    }

    private BannerRequest bannerRequest(OffsetDateTime startAt, OffsetDateTime endAt) {
        return new BannerRequest(
                "home_promo", "家电焕新季", null, "https://img.example/a.png", null, "CAMPAIGN", null, null, startAt, endAt);
    }

    @Nested
    class 创建banner {

        @Test
        void 结束早于开始_400拒绝() {
            assertThatThrownBy(() -> service.createBanner(bannerRequest(at(1, 10), at(1, 5))))
                    .isInstanceOfSatisfying(BusinessException.class, e -> {
                        assertThat(e.getHttpStatus()).isEqualTo(400);
                        assertThat(e.getCode()).isEqualTo("BANNER_TIME_RANGE_INVALID");
                    });
            verify(bannerMapper, never()).insert(any(Banner.class));
        }

        @Test
        void 结束等于开始_零窗口同样拒绝() {
            assertThatThrownBy(() -> service.createBanner(bannerRequest(at(1, 10), at(1, 10))))
                    .isInstanceOf(BusinessException.class);
            verify(bannerMapper, never()).insert(any(Banner.class));
        }

        @Test
        void 只给起或只给止_单端不受限_放行() {
            service.createBanner(bannerRequest(at(1, 10), null));
            service.createBanner(bannerRequest(null, at(1, 10)));

            verify(bannerMapper, times(2)).insert(any(Banner.class));
        }
    }

    @Nested
    class 更新banner {

        private final UUID id = UUID.randomUUID();

        private Banner existing(OffsetDateTime startAt, OffsetDateTime endAt, Integer sortOrder) {
            return Banner.builder()
                    .id(id)
                    .slot("home_promo")
                    .title("旧标题")
                    .imageUrl("https://img.example/a.png")
                    .sortOrder(sortOrder)
                    .status(CmsStatus.ENABLED)
                    .startAt(startAt)
                    .endAt(endAt)
                    .build();
        }

        @Test
        void 结束早于开始_400拒绝() {
            when(bannerMapper.selectById(id)).thenReturn(existing(null, null, null));

            assertThatThrownBy(() -> service.updateBanner(id, bannerRequest(at(1, 10), at(1, 5))))
                    .isInstanceOfSatisfying(BusinessException.class, e -> {
                        assertThat(e.getHttpStatus()).isEqualTo(400);
                        assertThat(e.getCode()).isEqualTo("BANNER_TIME_RANGE_INVALID");
                    });
            verify(bannerMapper, never()).updateById(any(Banner.class));
        }

        @Test
        void 只改结束_与原开始拼出矛盾窗口_400拒绝() {
            // 库里 startAt=1月10日；请求只给 endAt=1月5日，startAt 传 null 表示不改 —— 合并后窗口必须自洽
            when(bannerMapper.selectById(id)).thenReturn(existing(at(1, 10), at(1, 20), null));

            assertThatThrownBy(() -> service.updateBanner(id, bannerRequest(null, at(1, 5))))
                    .isInstanceOf(BusinessException.class);
            verify(bannerMapper, never()).updateById(any(Banner.class));
        }

        @Test
        void 时间不传_保持原窗口() {
            when(bannerMapper.selectById(id)).thenReturn(existing(at(1, 10), at(1, 20), null));

            service.updateBanner(id, bannerRequest(null, null));

            ArgumentCaptor<Banner> saved = ArgumentCaptor.forClass(Banner.class);
            verify(bannerMapper).updateById(saved.capture());
            assertThat(saved.getValue().getStartAt()).isEqualTo(at(1, 10));
            assertThat(saved.getValue().getEndAt()).isEqualTo(at(1, 20));
        }

        @Test
        void 排序不传_透传null不归零() {
            when(bannerMapper.selectById(id)).thenReturn(existing(null, null, 7));

            service.updateBanner(id, bannerRequest(null, null));

            ArgumentCaptor<Banner> saved = ArgumentCaptor.forClass(Banner.class);
            verify(bannerMapper).updateById(saved.capture());
            // null 交给 MyBatis-Plus NOT_NULL 策略跳过该列，保持库中原值，而不是被覆写成 0
            assertThat(saved.getValue().getSortOrder()).isNull();
        }
    }

    @Nested
    class 更新导航 {

        private final UUID id = UUID.randomUUID();

        @Test
        void 排序不传_透传null不归零() {
            when(navEntryMapper.selectById(id))
                    .thenReturn(NavEntry.builder()
                            .id(id)
                            .navKey("home")
                            .title("导航")
                            .sortOrder(3)
                            .status(CmsStatus.ENABLED)
                            .build());

            service.updateNav(id, new NavRequest("home", "新标题", null, null, null, null, null));

            ArgumentCaptor<NavEntry> saved = ArgumentCaptor.forClass(NavEntry.class);
            verify(navEntryMapper).updateById(saved.capture());
            assertThat(saved.getValue().getSortOrder()).isNull();
        }
    }

    @Nested
    class 推荐词条默认唯一 {

        private final UUID id = UUID.randomUUID();

        private RecommendTabRequest tabRequest(Boolean isDefault, Integer sortOrder) {
            return new RecommendTabRequest("智能家居", null, "SEARCH", isDefault, sortOrder);
        }

        @Test
        void 默认标记不传_透传null不强制取消() {
            when(recommendTabMapper.selectById(id))
                    .thenReturn(RecommendTab.builder()
                            .id(id)
                            .name("猜你喜欢")
                            .isDefault(true)
                            .sortOrder(1)
                            .status(CmsStatus.ENABLED)
                            .build());

            service.updateTab(id, tabRequest(null, null));

            ArgumentCaptor<RecommendTab> saved = ArgumentCaptor.forClass(RecommendTab.class);
            verify(recommendTabMapper).updateById(saved.capture());
            // isDefault / sortOrder 均为 null → NOT_NULL 策略跳过，库中原默认标记与原排序保持
            assertThat(saved.getValue().getIsDefault()).isNull();
            assertThat(saved.getValue().getSortOrder()).isNull();
        }

        @Test
        void 插入撞部分唯一索引_转409() {
            when(recommendTabMapper.insert(any(RecommendTab.class)))
                    .thenThrow(new DuplicateKeyException("uk_recommend_tabs_default"));

            assertThatThrownBy(() -> service.createTab(tabRequest(true, null)))
                    .isInstanceOfSatisfying(BusinessException.class, e -> {
                        assertThat(e.getHttpStatus()).isEqualTo(409);
                        assertThat(e.getDetail()).contains("默认推荐词条");
                    });
        }

        @Test
        void 更新撞部分唯一索引_转409() {
            when(recommendTabMapper.selectById(id))
                    .thenReturn(RecommendTab.builder()
                            .id(id)
                            .name("智能家居")
                            .isDefault(false)
                            .sortOrder(2)
                            .status(CmsStatus.ENABLED)
                            .build());
            doThrow(new DuplicateKeyException("uk_recommend_tabs_default"))
                    .when(recommendTabMapper)
                    .updateById(any(RecommendTab.class));

            assertThatThrownBy(() -> service.updateTab(id, tabRequest(true, null)))
                    .isInstanceOfSatisfying(BusinessException.class, e -> assertThat(e.getHttpStatus())
                            .isEqualTo(409));
        }
    }
}
