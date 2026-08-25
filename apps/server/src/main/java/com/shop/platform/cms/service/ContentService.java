package com.shop.platform.cms.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.shop.platform.cms.dto.BannerRequest;
import com.shop.platform.cms.dto.NavRequest;
import com.shop.platform.cms.dto.RecommendTabRequest;
import com.shop.platform.cms.mapper.Banner;
import com.shop.platform.cms.mapper.BannerMapper;
import com.shop.platform.cms.mapper.NavEntry;
import com.shop.platform.cms.mapper.NavEntryMapper;
import com.shop.platform.cms.mapper.RecommendTab;
import com.shop.platform.cms.mapper.RecommendTabMapper;
import com.shop.platform.common.Validate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * CMS 内容服务：首页导航 / 运营位 banner / 推荐条词条 的配置读写。
 *
 * <p>前台只读（只吐启用 + 生效时间窗口内的），后台全量读写。跳转 target 一律软关联，不 join 业务模块。 写入口直接接收 dto Request（与入参字段一一对应，不再拆包/再造聚合），status 由 path 传入。
 */
@Service
@RequiredArgsConstructor
public class ContentService {

    private final NavEntryMapper navEntryMapper;
    private final BannerMapper bannerMapper;
    private final RecommendTabMapper recommendTabMapper;

    // ========== 前台只读 ==========

    /** 前台首页导航：指定导航位下启用条目，按排序返回。subs 为 JSONB 整段带出 */
    public List<NavEntry> nav(String navKey) {
        return navEntryMapper.selectEnabledByKey(navKey);
    }

    /** 前台运营位 banner：启用 && 在生效时间窗口内（start_at/end_at 为 null 则不受限）。列表小，时间过滤在 Java 侧做 */
    public List<Banner> banners(String slot) {
        OffsetDateTime now = OffsetDateTime.now();
        return bannerMapper.selectEnabledBySlot(slot).stream()
                .filter(b -> (b.getStartAt() == null || !b.getStartAt().isAfter(now))
                        && (b.getEndAt() == null || !b.getEndAt().isBefore(now)))
                .toList();
    }

    /** 前台推荐条：启用词条按排序返回，is_default 标记"猜你喜欢" */
    public List<RecommendTab> recommendTabs() {
        return recommendTabMapper.selectEnabled();
    }

    // ========== 后台读 ==========

    public List<NavEntry> navAll(String navKey) {
        return navEntryMapper.selectList(new LambdaQueryWrapper<NavEntry>()
                .eq(navKey != null, NavEntry::getNavKey, navKey)
                .orderByAsc(NavEntry::getSortOrder)
                .orderByAsc(NavEntry::getId));
    }

    public List<Banner> bannersAll(String slot) {
        return bannerMapper.selectList(new LambdaQueryWrapper<Banner>()
                .eq(slot != null, Banner::getSlot, slot)
                .orderByAsc(Banner::getSortOrder)
                .orderByAsc(Banner::getId));
    }

    public List<RecommendTab> tabsAll() {
        return recommendTabMapper.selectList(new LambdaQueryWrapper<RecommendTab>()
                .orderByAsc(RecommendTab::getSortOrder)
                .orderByAsc(RecommendTab::getId));
    }

    // ========== 后台导航 ==========

    /** 创建导航条目：默认启用。navKey 是导航位归属，创建后不可改 */
    @Transactional
    public NavEntry createNav(NavRequest req) {
        NavEntry entry = NavEntry.builder()
                .navKey(req.navKey())
                .title(req.title())
                .iconKey(req.iconKey())
                .target(req.target())
                .targetType(req.targetType())
                .subs(req.subs())
                .sortOrder(req.sortOrder() != null ? req.sortOrder() : 0)
                .status(NavEntry.STATUS_ENABLED)
                .build();
        navEntryMapper.insert(entry);
        return entry;
    }

    /** 更新导航条目：navKey 不可改，其余全量覆写 */
    @Transactional
    public NavEntry updateNav(UUID id, NavRequest req) {
        // 1. 存在校验
        NavEntry entry = requireNav(id);
        // 2. 全量覆写展示字段
        entry.setTitle(req.title());
        entry.setIconKey(req.iconKey());
        entry.setTarget(req.target());
        entry.setTargetType(req.targetType());
        entry.setSubs(req.subs());
        entry.setSortOrder(req.sortOrder() != null ? req.sortOrder() : 0);
        navEntryMapper.updateById(entry);
        return entry;
    }

    /** 启用(1)/停用(0)：不做物理删除，可无损恢复 */
    @Transactional
    public void setNavStatus(UUID id, int status) {
        NavEntry entry = requireNav(id);
        entry.setStatus(status);
        navEntryMapper.updateById(entry);
    }

    // ========== 后台 banner ==========

    /** 创建 banner：默认启用。slot 是运营位归属，创建后不可改 */
    @Transactional
    public Banner createBanner(BannerRequest req) {
        Banner banner = Banner.builder()
                .slot(req.slot())
                .title(req.title())
                .subtitle(req.subtitle())
                .imageUrl(req.imageUrl())
                .target(req.target())
                .targetType(req.targetType())
                .link(req.link())
                .sortOrder(req.sortOrder() != null ? req.sortOrder() : 0)
                .status(Banner.STATUS_ENABLED)
                .startAt(req.startAt())
                .endAt(req.endAt())
                .build();
        bannerMapper.insert(banner);
        return banner;
    }

    /** 更新 banner：slot 不可改，其余全量覆写 */
    @Transactional
    public Banner updateBanner(UUID id, BannerRequest req) {
        // 1. 存在校验
        Banner banner = requireBanner(id);
        // 2. 全量覆写展示字段
        banner.setTitle(req.title());
        banner.setSubtitle(req.subtitle());
        banner.setImageUrl(req.imageUrl());
        banner.setTarget(req.target());
        banner.setTargetType(req.targetType());
        banner.setLink(req.link());
        banner.setSortOrder(req.sortOrder() != null ? req.sortOrder() : 0);
        banner.setStartAt(req.startAt());
        banner.setEndAt(req.endAt());
        bannerMapper.updateById(banner);
        return banner;
    }

    /** 启用(1)/停用(0)：不做物理删除，可无损恢复 */
    @Transactional
    public void setBannerStatus(UUID id, int status) {
        Banner banner = requireBanner(id);
        banner.setStatus(status);
        bannerMapper.updateById(banner);
    }

    // ========== 后台推荐条 ==========

    /** 创建词条：默认启用 */
    @Transactional
    public RecommendTab createTab(RecommendTabRequest req) {
        RecommendTab tab = RecommendTab.builder()
                .name(req.name())
                .target(req.target())
                .targetType(req.targetType())
                .isDefault(req.isDefault() != null ? req.isDefault() : false)
                .sortOrder(req.sortOrder() != null ? req.sortOrder() : 0)
                .status(RecommendTab.STATUS_ENABLED)
                .build();
        recommendTabMapper.insert(tab);
        return tab;
    }

    /** 更新词条：全量覆写展示字段 */
    @Transactional
    public RecommendTab updateTab(UUID id, RecommendTabRequest req) {
        RecommendTab tab = requireTab(id);
        tab.setName(req.name());
        tab.setTarget(req.target());
        tab.setTargetType(req.targetType());
        tab.setIsDefault(req.isDefault());
        tab.setSortOrder(req.sortOrder() != null ? req.sortOrder() : 0);
        recommendTabMapper.updateById(tab);
        return tab;
    }

    /** 启用(1)/停用(0)：不做物理删除，可无损恢复 */
    @Transactional
    public void setTabStatus(UUID id, int status) {
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
