package com.shop.platform.cms.controller;

import com.shop.platform.cms.dto.BannerRequest;
import com.shop.platform.cms.dto.NavRequest;
import com.shop.platform.cms.dto.RecommendTabRequest;
import com.shop.platform.cms.service.ContentService;
import com.shop.platform.common.Permissions;
import com.shop.platform.infra.security.authz.RequirePermission;
import io.swagger.v3.oas.annotations.tags.Tag;
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

/** 管理端 CMS 内容维护（认证由 StaffAuthFilter 统一处理，授权要求 CMS_MANAGE，岗位 OPS） */
@Tag(name = "cms-admin", description = "管理端 CMS 内容维护")
@RestController
@RequestMapping("/admin/cms")
@RequiredArgsConstructor
@RequirePermission(Permissions.CMS_MANAGE)
public class CmsContentAdminController {

    private final ContentService contentService;

    // ========== 导航 ==========

    @GetMapping("/nav")
    public List<NavEntryResponse> listAdminNav(@RequestParam(required = false) String navKey) {
        return NavEntryResponse.from(contentService.navAll(navKey));
    }

    @PostMapping("/nav")
    public NavEntryResponse createNav(@Valid @RequestBody NavRequest req) {
        return NavEntryResponse.from(contentService.createNav(req));
    }

    @PutMapping("/nav/{id}")
    public NavEntryResponse updateNav(@PathVariable UUID id, @Valid @RequestBody NavRequest req) {
        return NavEntryResponse.from(contentService.updateNav(id, req));
    }

    /** 状态走 path：启用 /nav/{id}/status/1，停用 /nav/{id}/status/0 */
    @PutMapping("/nav/{id}/status/{status}")
    public void setNavStatus(@PathVariable UUID id, @PathVariable Integer status) {
        contentService.setNavStatus(id, status);
    }

    // ========== banner ==========

    @GetMapping("/banners")
    public List<BannerResponse> listAdminBanners(@RequestParam(required = false) String slot) {
        return BannerResponse.from(contentService.bannersAll(slot));
    }

    @PostMapping("/banners")
    public BannerResponse createBanner(@Valid @RequestBody BannerRequest req) {
        return BannerResponse.from(contentService.createBanner(req));
    }

    @PutMapping("/banners/{id}")
    public BannerResponse updateBanner(@PathVariable UUID id, @Valid @RequestBody BannerRequest req) {
        return BannerResponse.from(contentService.updateBanner(id, req));
    }

    @PutMapping("/banners/{id}/status/{status}")
    public void setBannerStatus(@PathVariable UUID id, @PathVariable Integer status) {
        contentService.setBannerStatus(id, status);
    }

    // ========== 推荐条 ==========

    @GetMapping("/recommend-tabs")
    public List<RecommendTabResponse> listAdminRecommendTabs() {
        return RecommendTabResponse.from(contentService.tabsAll());
    }

    @PostMapping("/recommend-tabs")
    public RecommendTabResponse createTab(@Valid @RequestBody RecommendTabRequest req) {
        return RecommendTabResponse.from(contentService.createTab(req));
    }

    @PutMapping("/recommend-tabs/{id}")
    public RecommendTabResponse updateTab(@PathVariable UUID id, @Valid @RequestBody RecommendTabRequest req) {
        return RecommendTabResponse.from(contentService.updateTab(id, req));
    }

    @PutMapping("/recommend-tabs/{id}/status/{status}")
    public void setTabStatus(@PathVariable UUID id, @PathVariable Integer status) {
        contentService.setTabStatus(id, status);
    }
}
