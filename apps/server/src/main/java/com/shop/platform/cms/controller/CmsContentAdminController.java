package com.shop.platform.cms.controller;

import com.shop.platform.cms.dto.BannerRequest;
import com.shop.platform.cms.dto.NavRequest;
import com.shop.platform.cms.dto.RecommendTabRequest;
import com.shop.platform.cms.mapper.Banner;
import com.shop.platform.cms.mapper.NavEntry;
import com.shop.platform.cms.mapper.RecommendTab;
import com.shop.platform.cms.service.ContentService;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** 管理端 CMS 内容维护（鉴权由 StaffAuthFilter 统一处理：/admin/** 仅放行 kind=staff token） */
@RestController
@RequestMapping("/admin/cms")
@RequiredArgsConstructor
public class CmsContentAdminController {

    private final ContentService contentService;

    // ========== 导航 ==========

    @GetMapping("/nav")
    public List<NavEntry> nav(@RequestParam(required = false) String navKey) {
        return contentService.navAll(navKey);
    }

    @PostMapping("/nav")
    public NavEntry createNav(@Valid @RequestBody NavRequest req) {
        return contentService.createNav(req);
    }

    @PutMapping("/nav/{id}")
    public NavEntry updateNav(@PathVariable UUID id, @Valid @RequestBody NavRequest req) {
        return contentService.updateNav(id, req);
    }

    /** 状态走 path：启用 /nav/{id}/status/1，停用 /nav/{id}/status/0 */
    @PutMapping("/nav/{id}/status/{status}")
    public void setNavStatus(@PathVariable UUID id, @PathVariable Integer status) {
        contentService.setNavStatus(id, status);
    }

    // ========== banner ==========

    @GetMapping("/banners")
    public List<Banner> banners(@RequestParam(required = false) String slot) {
        return contentService.bannersAll(slot);
    }

    @PostMapping("/banners")
    public Banner createBanner(@Valid @RequestBody BannerRequest req) {
        return contentService.createBanner(req);
    }

    @PutMapping("/banners/{id}")
    public Banner updateBanner(@PathVariable UUID id, @Valid @RequestBody BannerRequest req) {
        return contentService.updateBanner(id, req);
    }

    @PutMapping("/banners/{id}/status/{status}")
    public void setBannerStatus(@PathVariable UUID id, @PathVariable Integer status) {
        contentService.setBannerStatus(id, status);
    }

    // ========== 推荐条 ==========

    @GetMapping("/recommend-tabs")
    public List<RecommendTab> tabs() {
        return contentService.tabsAll();
    }

    @PostMapping("/recommend-tabs")
    public RecommendTab createTab(@Valid @RequestBody RecommendTabRequest req) {
        return contentService.createTab(req);
    }

    @PutMapping("/recommend-tabs/{id}")
    public RecommendTab updateTab(@PathVariable UUID id, @Valid @RequestBody RecommendTabRequest req) {
        return contentService.updateTab(id, req);
    }

    @PutMapping("/recommend-tabs/{id}/status/{status}")
    public void setTabStatus(@PathVariable UUID id, @PathVariable Integer status) {
        contentService.setTabStatus(id, status);
    }
}
