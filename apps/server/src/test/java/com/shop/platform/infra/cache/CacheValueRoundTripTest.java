package com.shop.platform.infra.cache;

import static org.assertj.core.api.Assertions.assertThat;

import com.shop.platform.cms.mapper.Banner;
import com.shop.platform.cms.mapper.NavEntry;
import com.shop.platform.cms.model.CmsStatus;
import com.shop.platform.cms.model.NavGroup;
import com.shop.platform.product.model.CategoryStatus;
import com.shop.platform.product.service.CategoryNode;
import com.shop.platform.shop.mapper.Shop;
import com.shop.platform.shop.model.ShopStatus;
import java.time.OffsetDateTime;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.serializer.JacksonJsonRedisSerializer;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

/**
 * 缓存值的字节口径：写出去的字节必须读得回来。
 *
 * <p>这条链路 {@link ReadCacheTest} 碰不到——它用内存缓存器，压根不序列化。而「读不回来」的后果不是慢，是首页
 * 500：{@code @Cacheable} 命中缓存后直接抛 SerializationException。实测踩过一次（{@code Banner} 的派生
 * getter {@code isTimeRangeValid()} 被写成属性，严格口径读不回），所以把每个登记类型的往返钉在这里。
 */
class CacheValueRoundTripTest {

    private final ObjectMapper mapper =
            CacheConfig.lenientReader(JsonMapper.builder().build());

    @Test
    void 实体上的派生getter写得出去也读得回来() {
        Banner banner = new Banner();
        banner.setSlot("home_promo");
        banner.setStatus(CmsStatus.ENABLED);
        banner.setStartAt(OffsetDateTime.parse("2026-09-01T00:00:00Z"));
        banner.setEndAt(OffsetDateTime.parse("2026-09-30T00:00:00Z"));
        Shop shop = new Shop();
        shop.setStatus(ShopStatus.ACTIVE);
        assertThat(banner.isTimeRangeValid()).isTrue();
        assertThat(shop.isActive()).isTrue();
        // 前提成立才值得往下断言：派生 getter 真被写成了属性（Jackson 口径变了这测试就白做了）
        assertThat(mapper.writeValueAsString(banner)).contains("timeRangeValid");

        List<Banner> banners = roundTrip(CacheSpec.list(CacheNames.CMS_BANNER, mapper, Banner.class), List.of(banner));
        assertThat(banners).singleElement().satisfies(read -> {
            assertThat(read.getSlot()).isEqualTo("home_promo");
            assertThat(read.getStatus()).isEqualTo(CmsStatus.ENABLED);
            assertThat(read.getStartAt()).isEqualTo(banner.getStartAt());
            assertThat(read.isTimeRangeValid()).isTrue();
        });
        assertThat(roundTrip(CacheSpec.single(CacheNames.SHOP_PUBLIC, mapper, Shop.class), shop)
                        .isActive())
                .isTrue();
    }

    @Test
    void 嵌套结构与集合顺序在往返里保住() {
        // 类目树：递归 children + 枚举 + 可空图标，形状塌一层就等于详情页类目面包屑没了
        CategoryNode child = CategoryNode.builder()
                .id(UUID.randomUUID())
                .name("智能手机")
                .level(3)
                .sort(1)
                .status(CategoryStatus.ENABLED)
                .children(List.of())
                .build();
        CategoryNode root = CategoryNode.builder()
                .id(UUID.randomUUID())
                .name("数码")
                .level(1)
                .sort(1)
                .status(CategoryStatus.ENABLED)
                .iconUrl(null)
                .children(List.of(child))
                .build();
        assertThat(roundTrip(CacheSpec.list(CacheNames.CATEGORY_TREE, mapper, CategoryNode.class), List.of(root)))
                .isEqualTo(List.of(root));

        // 子树 id 集：落回 HashSet，顺序不保——两个消费方都只把它铺进 SQL 的 IN 列表，顺序由商品侧的 ORDER BY 定
        List<UUID> ids = List.of(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID());
        Set<UUID> subtree =
                roundTrip(CacheSpec.set(CacheNames.CATEGORY_SUBTREE, mapper, UUID.class), new LinkedHashSet<>(ids));
        assertThat(subtree).containsExactlyInAnyOrderElementsOf(ids);

        // subs 是 JSONB 整段带出的 List<record>
        NavEntry entry = new NavEntry();
        entry.setNavKey("home");
        entry.setTitle("手机数码");
        entry.setSubs(List.of(new NavGroup("手机通讯", List.of("智能手机", "老人机"))));
        assertThat(roundTrip(CacheSpec.list(CacheNames.CMS_NAV, mapper, NavEntry.class), List.of(entry)))
                .singleElement()
                .satisfies(read -> assertThat(read.getSubs()).isEqualTo(entry.getSubs()));
    }

    private <T> T roundTrip(CacheSpec spec, T value) {
        JacksonJsonRedisSerializer<T> serializer = new JacksonJsonRedisSerializer<>(mapper, spec.valueType());
        return serializer.deserialize(serializer.serialize(value));
    }
}
