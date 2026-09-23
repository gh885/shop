package com.shop.platform.cms.service;

import com.shop.platform.cms.mapper.Banner;
import com.shop.platform.cms.mapper.BannerMapper;
import com.shop.platform.cms.mapper.NavEntry;
import com.shop.platform.cms.mapper.NavEntryMapper;
import com.shop.platform.cms.mapper.RecommendTab;
import com.shop.platform.cms.mapper.RecommendTabMapper;
import com.shop.platform.infra.cache.CacheNames;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Component;

/**
 * CMS 前台三块配置的读（首页导航 / 运营位 banner / 推荐条），整段进 Redis 读缓存。
 *
 * <p>单独一个 bean，而不是把 {@code @Cacheable} 写在 {@link ContentService} 自己的方法上：缓存靠代理生效，
 * 同类自调用不走代理——写在 ContentService 里再由它内部调过去，缓存看着接上了其实一次都不命中。banner 恰好
 * 就是这个形状（缓存的是「该运营位的启用行」，生效时间窗口的过滤留在 ContentService 每次现算，否则缓存会把
 * 定时上下线冻住），所以三块统一走这里，口径一致。
 *
 * <p>失效由 ContentService 的后台写方法负责（同一批缓存名，见 {@link CacheNames}）。
 */
@Component
@RequiredArgsConstructor
public class CmsPublicReader {

    private final NavEntryMapper navEntryMapper;
    private final BannerMapper bannerMapper;
    private final RecommendTabMapper recommendTabMapper;

    /** 指定导航位的启用条目（按排序），含 JSONB 的 subs 整段 */
    @Cacheable(cacheNames = CacheNames.CMS_NAV, key = "#navKey")
    public List<NavEntry> enabledNav(String navKey) {
        return navEntryMapper.selectEnabledByKey(navKey);
    }

    /** 指定运营位的启用条目；生效时间窗口不在这里筛（筛了就等于把定时上下线冻进缓存） */
    @Cacheable(cacheNames = CacheNames.CMS_BANNER, key = "#slot")
    public List<Banner> enabledBanners(String slot) {
        return bannerMapper.selectEnabledBySlot(slot);
    }

    /** 启用的推荐词条；无参读的 key 显式给一个，否则 Redis 里落下的是 {@code SimpleKey []} 那种带空格的键 */
    @Cacheable(cacheNames = CacheNames.CMS_RECOMMEND_TAB, key = "'all'")
    public List<RecommendTab> enabledTabs() {
        return recommendTabMapper.selectEnabled();
    }
}
