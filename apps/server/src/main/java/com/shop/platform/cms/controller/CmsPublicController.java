package com.shop.platform.cms.controller;

import com.shop.platform.cms.service.ContentService;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * CMS 前台只读（匿名可访问，见 JwtProperties.skipPaths）。
 *
 * <p>首页 SSR loader 并发拉这三块；数据量小，全量返回由前端缓存。跳转 target 软关联，前端携 ID 另调业务接口。
 */
@RestController
@RequestMapping("/api/cms")
@RequiredArgsConstructor
public class CmsPublicController {

    private final ContentService contentService;

    /** 首页分类导航：指定导航位下的启用条目（subs 为 JSONB 整段） */
    @GetMapping("/nav")
    public List<NavEntryResponse> nav(@RequestParam(defaultValue = "home") String navKey) {
        return NavEntryResponse.from(contentService.nav(navKey));
    }

    /** 首页运营位 banner：启用且命中生效时间窗口 */
    @GetMapping("/banners")
    public List<BannerResponse> banners(@RequestParam(defaultValue = "home_promo") String slot) {
        return BannerResponse.from(contentService.banners(slot));
    }

    /** 首页推荐条词条（扁平数组，is_default 标"猜你喜欢"） */
    @GetMapping("/recommend-tabs")
    public List<RecommendTabResponse> recommendTabs() {
        return RecommendTabResponse.from(contentService.recommendTabs());
    }
}
