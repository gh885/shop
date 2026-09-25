package com.shop.platform.cms.service;

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
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.ErrorCodes;
import com.shop.platform.common.Validate;
import com.shop.platform.infra.cache.CacheNames;
import com.shop.platform.infra.db.DuplicateKeys;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * CMS 内容服务：首页导航 / 运营位 banner / 推荐条词条 的配置读写。
 *
 * <p>前台只读（只吐启用 + 生效时间窗口内的），后台全量读写。跳转 target 一律软关联，不 join 业务模块。 写入口直接接收 dto Request（与入参字段一一对应，不再拆包/再造聚合），status 由 path 传入。
 *
 * <p>前台那三块读走 Redis 读缓存（{@link CmsPublicReader}），所以每个后台写都挂一道 {@code @CacheEvict}，
 * 运营改完下一请求就生效。缓存按导航位/运营位分键，而写的是某一行的 id——它属于哪个位得查库才知道，
 * 于是整组清（{@code allEntries}）；写侧是运营手点，量级用不着精确。
 */
@Service
@RequiredArgsConstructor
public class ContentService {

    private final NavEntryMapper navEntryMapper;
    private final BannerMapper bannerMapper;
    private final RecommendTabMapper recommendTabMapper;
    private final CmsPublicReader publicReader;

    // 前台只读（经 CmsPublicReader 走 Redis 读缓存；这三块是首页 SSR 每次都要读的，改得极少）
    /** 前台首页导航：指定导航位下启用条目，按排序返回。subs 为 JSONB 整段带出 */
    public List<NavEntry> nav(String navKey) {
        return publicReader.enabledNav(navKey);
    }

    /**
     * 前台运营位 banner：启用 &amp;&amp; 在生效时间窗口内（start_at/end_at 为 null 则不受限）。列表小，时间过滤在 Java 侧做。
     *
     * <p>刻意只缓存「启用行」这一层：把带 now 的过滤一起缓存，等于把定时上下线冻进缓存到 TTL 为止。
     */
    public List<Banner> banners(String slot) {
        OffsetDateTime now = OffsetDateTime.now();
        return publicReader.enabledBanners(slot).stream()
                .filter(b -> (b.getStartAt() == null || !b.getStartAt().isAfter(now))
                        && (b.getEndAt() == null || !b.getEndAt().isBefore(now)))
                .toList();
    }

    /** 前台推荐条：启用词条按排序返回，is_default 标记"猜你喜欢" */
    public List<RecommendTab> recommendTabs() {
        return publicReader.enabledTabs();
    }

    // 后台读：全量含停用，筛选与排序口径见各 mapper 的 selectXxxAllOrdered
    public List<NavEntry> navAll(String navKey) {
        return navEntryMapper.selectNavAllOrdered(navKey);
    }

    public List<Banner> bannersAll(String slot) {
        return bannerMapper.selectBannerAllOrdered(slot);
    }

    public List<RecommendTab> tabsAll() {
        return recommendTabMapper.selectTabAllOrdered();
    }

    // 后台导航
    /** 创建导航条目：默认启用。navKey 是导航位归属，创建后不可改 */
    @Transactional
    @CacheEvict(cacheNames = CacheNames.CMS_NAV, allEntries = true)
    public NavEntry createNav(NavRequest req) {
        NavEntry entry = NavEntry.builder()
                .navKey(req.navKey())
                .title(req.title())
                .iconKey(req.iconKey())
                .target(req.target())
                .targetType(req.targetType())
                .subs(req.subs())
                .sortOrder(req.sortOrder() != null ? req.sortOrder() : 0)
                .status(CmsStatus.ENABLED)
                .build();
        navEntryMapper.insert(entry);
        return entry;
    }

    /** 更新导航条目：navKey 不可改，其余字段逐个覆写（null 字段保持原值） */
    @Transactional
    @CacheEvict(cacheNames = CacheNames.CMS_NAV, allEntries = true)
    public NavEntry updateNav(UUID id, NavRequest req) {
        // 1. 存在校验
        NavEntry entry = requireNav(id);
        // 2. 覆写展示字段：null 交由 MyBatis-Plus NOT_NULL 策略跳过，保持原值
        entry.setTitle(req.title());
        entry.setIconKey(req.iconKey());
        entry.setTarget(req.target());
        entry.setTargetType(req.targetType());
        entry.setSubs(req.subs());
        entry.setSortOrder(req.sortOrder());
        navEntryMapper.updateById(entry);
        return entry;
    }

    /** 启用(1)/停用(0)：不做物理删除，可无损恢复 */
    @Transactional
    @CacheEvict(cacheNames = CacheNames.CMS_NAV, allEntries = true)
    public void setNavStatus(UUID id, CmsStatus status) {
        NavEntry entry = requireNav(id);
        entry.setStatus(status);
        navEntryMapper.updateById(entry);
    }

    // 后台 banner
    /** 创建 banner：默认启用。slot 是运营位归属，创建后不可改 */
    @Transactional
    @CacheEvict(cacheNames = CacheNames.CMS_BANNER, allEntries = true)
    public Banner createBanner(BannerRequest req) {
        // 1. 组装实体（默认启用，未指定排序归零）
        Banner banner = Banner.builder()
                .slot(req.slot())
                .title(req.title())
                .subtitle(req.subtitle())
                .imageUrl(req.imageUrl())
                .target(req.target())
                .targetType(req.targetType())
                .link(req.link())
                .sortOrder(req.sortOrder() != null ? req.sortOrder() : 0)
                .status(CmsStatus.ENABLED)
                .startAt(req.startAt())
                .endAt(req.endAt())
                .build();
        // 2. 生效窗口校验：起止都给了时 endAt 必须晚于 startAt
        if (!banner.isTimeRangeValid()) {
            throw BusinessException.badRequest(ErrorCodes.BANNER_TIME_RANGE_INVALID, "banner 失效时间必须晚于生效时间");
        }
        // 3. 落库
        bannerMapper.insert(banner);
        return banner;
    }

    /** 更新 banner：slot 不可改，其余字段逐个覆写（null 字段保持原值） */
    @Transactional
    @CacheEvict(cacheNames = CacheNames.CMS_BANNER, allEntries = true)
    public Banner updateBanner(UUID id, BannerRequest req) {
        // 1. 存在校验
        Banner banner = requireBanner(id);
        // 2. 覆写展示字段：null 交由 MyBatis-Plus NOT_NULL 策略跳过，保持原值
        banner.setTitle(req.title());
        banner.setSubtitle(req.subtitle());
        banner.setImageUrl(req.imageUrl());
        banner.setTarget(req.target());
        banner.setTargetType(req.targetType());
        banner.setLink(req.link());
        banner.setSortOrder(req.sortOrder());
        // 3. 生效窗口：时间字段 null 表示不改，与库中原窗口合并后再校验，防止拼出自相矛盾的窗口
        banner.setStartAt(req.startAt() != null ? req.startAt() : banner.getStartAt());
        banner.setEndAt(req.endAt() != null ? req.endAt() : banner.getEndAt());
        if (!banner.isTimeRangeValid()) {
            throw BusinessException.badRequest(ErrorCodes.BANNER_TIME_RANGE_INVALID, "banner 失效时间必须晚于生效时间");
        }
        bannerMapper.updateById(banner);
        return banner;
    }

    /** 启用(1)/停用(0)：不做物理删除，可无损恢复 */
    @Transactional
    @CacheEvict(cacheNames = CacheNames.CMS_BANNER, allEntries = true)
    public void setBannerStatus(UUID id, CmsStatus status) {
        Banner banner = requireBanner(id);
        banner.setStatus(status);
        bannerMapper.updateById(banner);
    }

    // 后台推荐条
    /** 创建词条：默认启用 */
    @Transactional
    @CacheEvict(cacheNames = CacheNames.CMS_RECOMMEND_TAB, allEntries = true)
    public RecommendTab createTab(RecommendTabRequest req) {
        RecommendTab tab = RecommendTab.builder()
                .name(req.name())
                .target(req.target())
                .targetType(req.targetType())
                .isDefault(req.isDefault() != null ? req.isDefault() : false)
                .sortOrder(req.sortOrder() != null ? req.sortOrder() : 0)
                .status(CmsStatus.ENABLED)
                .build();
        // 全局至多一个默认词条由部分唯一索引 uk_recommend_tabs_default 钉死，撞键转 409（admin 前端已协作取消其余默认）
        DuplicateKeys.conflictOnDuplicate(() -> recommendTabMapper.insert(tab), "已存在默认推荐词条，请先取消原默认再设置");
        return tab;
    }

    /** 更新词条：字段逐个覆写，null 保持原值（isDefault 为 null 即不改默认标记） */
    @Transactional
    @CacheEvict(cacheNames = CacheNames.CMS_RECOMMEND_TAB, allEntries = true)
    public RecommendTab updateTab(UUID id, RecommendTabRequest req) {
        // 1. 存在校验
        RecommendTab tab = requireTab(id);
        // 2. 覆写展示字段：null 交由 MyBatis-Plus NOT_NULL 策略跳过，保持原值
        tab.setName(req.name());
        tab.setTarget(req.target());
        tab.setTargetType(req.targetType());
        tab.setIsDefault(req.isDefault());
        tab.setSortOrder(req.sortOrder());
        // 3. 落库：把本词条设为默认时若另一行仍是默认，撞部分唯一索引 uk_recommend_tabs_default 转 409
        DuplicateKeys.conflictOnDuplicate(() -> recommendTabMapper.updateById(tab), "已存在默认推荐词条，请先取消原默认再设置");
        return tab;
    }

    /** 启用(1)/停用(0)：不做物理删除，可无损恢复 */
    @Transactional
    @CacheEvict(cacheNames = CacheNames.CMS_RECOMMEND_TAB, allEntries = true)
    public void setTabStatus(UUID id, CmsStatus status) {
        RecommendTab tab = requireTab(id);
        tab.setStatus(status);
        recommendTabMapper.updateById(tab);
    }

    private NavEntry requireNav(UUID id) {
        return Validate.notNull(navEntryMapper.selectById(id), "导航条目不存在");
    }

    private Banner requireBanner(UUID id) {
        return Validate.notNull(bannerMapper.selectById(id), "运营位不存在");
    }

    private RecommendTab requireTab(UUID id) {
        return Validate.notNull(recommendTabMapper.selectById(id), "推荐词条不存在");
    }
}
