package com.shop.platform.cms.controller;

import com.shop.platform.cms.controller.response.BannerResponse;
import com.shop.platform.cms.controller.response.NavEntryResponse;
import com.shop.platform.cms.controller.response.RecommendTabResponse;
import com.shop.platform.cms.service.ContentService;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * CMS 前台只读（匿名可访问）。
 *
 * <p>首页 SSR loader 并发拉这三块；跳转 target 软关联，前端携 ID 另调业务接口。三块都是 Redis 读缓存的服务端那一层
 * （失效挂在后台写上，见 CMS-09），前端另有一层 5 分钟壳缓存（WEB-12）。
 */
@Tag(name = "cms-public", description = "CMS 前台只读（匿名可访问）")
@RestController
@RequestMapping("/api/cms")
@RequiredArgsConstructor
public class CmsPublicController {

    private final ContentService contentService;

    /** 首页分类导航：指定导航位下的启用条目（subs 为 JSONB 整段） */
    @GetMapping("/nav")
    public List<NavEntryResponse> getHomeNav(@RequestParam(defaultValue = "home") String navKey) {
        return contentService.nav(navKey).stream().map(NavEntryResponse::from).toList();
    }

    /** 首页运营位 banner：启用且命中生效时间窗口 */
    @GetMapping("/banners")
    public List<BannerResponse> getHomeBanners(@RequestParam(defaultValue = "home_promo") String slot) {
        return contentService.banners(slot).stream().map(BannerResponse::from).toList();
    }

    /** 首页推荐条词条（扁平数组，is_default 标"猜你喜欢"） */
    @GetMapping("/recommend-tabs")
    public List<RecommendTabResponse> getRecommendTabs() {
        return contentService.recommendTabs().stream()
                .map(RecommendTabResponse::from)
                .toList();
    }
}
