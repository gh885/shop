package com.shop.platform.infra.cache;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.shop.platform.account.api.UserReadQuery;
import com.shop.platform.cms.dto.NavRequest;
import com.shop.platform.cms.mapper.Banner;
import com.shop.platform.cms.mapper.BannerMapper;
import com.shop.platform.cms.mapper.NavEntry;
import com.shop.platform.cms.mapper.NavEntryMapper;
import com.shop.platform.cms.mapper.RecommendTabMapper;
import com.shop.platform.cms.service.CmsPublicReader;
import com.shop.platform.cms.service.ContentService;
import com.shop.platform.common.BusinessException;
import com.shop.platform.product.mapper.Category;
import com.shop.platform.product.mapper.CategoryMapper;
import com.shop.platform.product.mapper.ProductMapper;
import com.shop.platform.product.model.CategoryStatus;
import com.shop.platform.product.service.CategoryService;
import com.shop.platform.shop.mapper.Shop;
import com.shop.platform.shop.mapper.ShopMapper;
import com.shop.platform.shop.mapper.ShopMemberMapper;
import com.shop.platform.shop.mapper.ShopReviewMapper;
import com.shop.platform.shop.model.ShopStatus;
import com.shop.platform.shop.service.ShopService;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.cache.concurrent.ConcurrentMapCacheManager;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * 三块配置读缓存的语义，用内存缓存器验（不依赖 Redis：Redis 那层要验的是字节口径，不是接线）。
 *
 * <p>盯的都是「接了等于没接」的失效形态：
 * ① {@code @Cacheable} 靠代理生效——同类自调用一次都不命中，这正是把前台读拆进 {@link CmsPublicReader} 的原因，
 * 于是断言全部落在「mapper 被打了几次」上，而不是返回值看起来对；
 * ② 后台写没挂失效的话，运营改完要等一个 TTL，而列表页看着像没保存；
 * ③ banner 的生效时间窗口若在缓存里筛，定时上下线就会被冻住——所以缓存的是启用行、每次现算窗口。
 */
class ReadCacheTest {

    private AnnotationConfigApplicationContext context;
    private NavEntryMapper navMapper;
    private BannerMapper bannerMapper;
    private CategoryMapper categoryMapper;
    private ShopMapper shopMapper;
    private ContentService contentService;
    private CategoryService categoryService;
    private ShopService shopService;

    @BeforeEach
    void boot() {
        context = new AnnotationConfigApplicationContext(TestConfig.class);
        navMapper = context.getBean(NavEntryMapper.class);
        bannerMapper = context.getBean(BannerMapper.class);
        categoryMapper = context.getBean(CategoryMapper.class);
        shopMapper = context.getBean(ShopMapper.class);
        contentService = context.getBean(ContentService.class);
        categoryService = context.getBean(CategoryService.class);
        shopService = context.getBean(ShopService.class);
    }

    @AfterEach
    void close() {
        context.close();
    }

    @Test
    @DisplayName("首页导航_读两次只打一次库")
    void navCached() {
        when(navMapper.selectEnabledByKey("home")).thenReturn(List.of(nav("冰洗")));

        assertThat(contentService.nav("home")).hasSize(1);
        assertThat(contentService.nav("home")).hasSize(1);

        verify(navMapper, times(1)).selectEnabledByKey("home");
    }

    @Test
    @DisplayName("后台改导航_下一次读重新打库")
    void navEvictedOnWrite() {
        when(navMapper.selectEnabledByKey("home")).thenReturn(List.of(nav("冰洗")));
        contentService.nav("home");

        contentService.createNav(new NavRequest("home", "空调", null, null, null, null, null));

        contentService.nav("home");
        verify(navMapper, times(2)).selectEnabledByKey("home");
    }

    @Test
    @DisplayName("banner_缓存的是启用行，生效窗口每次现算")
    void bannerWindowNotFrozen() {
        // 一条永不过期、一条要一小时后才上线：缓存里两条都在，前台每次只看当下该露的那条
        Banner live = banner("常驻");
        Banner scheduled = banner("一小时后");
        scheduled.setStartAt(OffsetDateTime.now().plusHours(1));
        when(bannerMapper.selectEnabledBySlot("home_promo")).thenReturn(List.of(live, scheduled));

        assertThat(contentService.banners("home_promo"))
                .extracting(Banner::getTitle)
                .containsExactly("常驻");
        assertThat(contentService.banners("home_promo"))
                .extracting(Banner::getTitle)
                .containsExactly("常驻");

        verify(bannerMapper, times(1)).selectEnabledBySlot("home_promo");
    }

    @Test
    @DisplayName("类目树与子树_读两次各打一次库，改名后重新打")
    void categoryTreeAndSubtreeCached() {
        UUID root = UUID.randomUUID();
        when(categoryMapper.selectAll()).thenReturn(List.of(category(root)));
        when(categoryMapper.selectById(root)).thenReturn(category(root));

        assertThat(categoryService.publicTree()).hasSize(1);
        assertThat(categoryService.publicTree()).hasSize(1);
        assertThat(categoryService.descendantIds(root)).containsExactly(root);
        assertThat(categoryService.descendantIds(root)).containsExactly(root);
        // 树和子树是两份缓存：各自命中一次，全表读因此是 2 次而不是 4 次
        verify(categoryMapper, times(2)).selectAll();

        categoryService.update(root, "改名", null, null);

        categoryService.publicTree();
        categoryService.descendantIds(root);
        verify(categoryMapper, times(4)).selectAll();
    }

    @Test
    @DisplayName("店铺公开信息_读两次只打一次库；未过审的店不缓存，所以通过审核无需失效")
    void publicShopCachedAndNotCachedForNonActive() {
        UUID shopId = UUID.randomUUID();
        when(shopMapper.selectById(shopId)).thenReturn(shop(shopId, ShopStatus.ACTIVE));
        shopService.publicShop(shopId);
        shopService.publicShop(shopId);
        verify(shopMapper, times(1)).selectById(shopId);

        // 待审核：404 是抛异常，异常不入缓存——所以连着两次读都真的查库，审核通过后下一请求立刻可见
        UUID pending = UUID.randomUUID();
        when(shopMapper.selectById(pending)).thenReturn(shop(pending, ShopStatus.PENDING_REVIEW));
        assertThatThrownBy(() -> shopService.publicShop(pending)).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> shopService.publicShop(pending)).isInstanceOf(BusinessException.class);

        verify(shopMapper, times(2)).selectById(pending);
    }

    private static NavEntry nav(String title) {
        NavEntry entry = new NavEntry();
        entry.setNavKey("home");
        entry.setTitle(title);
        return entry;
    }

    private static Banner banner(String title) {
        Banner banner = new Banner();
        banner.setSlot("home_promo");
        banner.setTitle(title);
        return banner;
    }

    private static Category category(UUID id) {
        Category category = new Category();
        category.setId(id);
        category.setParentId(Category.ROOT_PARENT_ID);
        category.setName("大家电");
        category.setLevel(1);
        category.setSort(0);
        category.setStatus(CategoryStatus.ENABLED);
        return category;
    }

    private static Shop shop(UUID id, ShopStatus status) {
        Shop shop = new Shop();
        shop.setId(id);
        shop.setName("演示店");
        shop.setStatus(status);
        return shop;
    }

    /**
     * 只装缓存这层需要的东西：缓存器用内存实现（生产口径见 {@link CacheConfig}，那里换成 Redis 且登记每个名字的
     * 值类型），服务与 mapper 全是真的服务 + 假的 mapper——要验的正是「注解有没有真的接上」。
     */
    @Configuration(proxyBeanMethods = false)
    @EnableCaching
    static class TestConfig {

        @Bean
        CacheManager cacheManager() {
            return new ConcurrentMapCacheManager(CacheNames.ALL.toArray(String[]::new));
        }

        @Bean
        NavEntryMapper navEntryMapper() {
            return mock(NavEntryMapper.class);
        }

        @Bean
        BannerMapper bannerMapper() {
            return mock(BannerMapper.class);
        }

        @Bean
        RecommendTabMapper recommendTabMapper() {
            return mock(RecommendTabMapper.class);
        }

        @Bean
        CategoryMapper categoryMapper() {
            return mock(CategoryMapper.class);
        }

        @Bean
        ProductMapper productMapper() {
            return mock(ProductMapper.class);
        }

        @Bean
        ShopMapper shopMapper() {
            return mock(ShopMapper.class);
        }

        @Bean
        ShopMemberMapper shopMemberMapper() {
            return mock(ShopMemberMapper.class);
        }

        @Bean
        ShopReviewMapper shopReviewMapper() {
            return mock(ShopReviewMapper.class);
        }

        @Bean
        UserReadQuery userReadQuery() {
            return mock(UserReadQuery.class);
        }

        @Bean
        CmsPublicReader cmsPublicReader(
                NavEntryMapper navEntryMapper, BannerMapper bannerMapper, RecommendTabMapper recommendTabMapper) {
            return new CmsPublicReader(navEntryMapper, bannerMapper, recommendTabMapper);
        }

        @Bean
        ContentService contentService(
                NavEntryMapper navEntryMapper,
                BannerMapper bannerMapper,
                RecommendTabMapper recommendTabMapper,
                CmsPublicReader cmsPublicReader) {
            return new ContentService(navEntryMapper, bannerMapper, recommendTabMapper, cmsPublicReader);
        }

        @Bean
        CategoryService categoryService(CategoryMapper categoryMapper, ProductMapper productMapper) {
            return new CategoryService(categoryMapper, productMapper);
        }

        @Bean
        ShopService shopService(
                ShopMapper shopMapper,
                ShopMemberMapper shopMemberMapper,
                ShopReviewMapper shopReviewMapper,
                UserReadQuery userReadQuery) {
            return new ShopService(shopMapper, shopMemberMapper, shopReviewMapper, userReadQuery);
        }
    }
}
