package com.shop.platform.shop.controller;

import com.shop.platform.common.PageParams;
import com.shop.platform.common.PageResult;
import com.shop.platform.common.Permissions;
import com.shop.platform.infra.security.authz.RequirePermission;
import com.shop.platform.infra.web.CurrentStaff;
import com.shop.platform.shop.dto.AdminShopQuery;
import com.shop.platform.shop.service.AdminShopItem;
import com.shop.platform.shop.service.ShopAdminService;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * 平台侧店铺治理（ACC-60）：店铺列表 + 封店 / 解封。与入驻审核（{@code /admin/reviews}）分端：
 * 审核管「能不能开张」，这里管「开张的店要不要继续营业」。
 *
 * <p>封店与在架商品的级联下架是同一个事务单元（见 {@code ShopAdminService.suspend}）。
 */
@Tag(name = "admin-shops", description = "平台侧店铺治理（封店/解封）")
@RestController
@RequestMapping("/admin/shops")
@Validated
@RequiredArgsConstructor
@RequirePermission(Permissions.SHOP_GOVERNANCE)
public class AdminShopController {

    private final ShopAdminService shopAdminService;

    /** GET /admin/shops —— 店铺列表；状态档位与关键字（店名/店主 ID）可组合筛选 */
    @GetMapping
    public PageResult<AdminShopItem> listAdminShops(@Valid PageParams pageParams, @Valid AdminShopQuery query) {
        return shopAdminService.pageShops(pageParams, query);
    }

    /** 封店：营业中 → 封停，级联下架在架商品；非营业中 409 */
    @PostMapping("/{id}/suspend")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void suspendShop(@CurrentStaff UUID staffId, @PathVariable UUID id) {
        shopAdminService.suspend(id, staffId);
    }

    /** 解封：封停 → 营业中，不自动重上架；店主账号已注销/禁用时 400 */
    @PostMapping("/{id}/resume")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void resumeShop(@CurrentStaff UUID staffId, @PathVariable UUID id) {
        shopAdminService.resume(id, staffId);
    }
}
