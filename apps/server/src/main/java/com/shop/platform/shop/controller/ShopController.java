package com.shop.platform.shop.controller;

import com.shop.platform.infra.web.CurrentUser;
import com.shop.platform.shop.controller.response.PhoneRevealResponse;
import com.shop.platform.shop.dto.CreateShopRequest;
import com.shop.platform.shop.dto.CreateSubaccountRequest;
import com.shop.platform.shop.dto.ResetSubaccountPasswordRequest;
import com.shop.platform.shop.dto.UpdateSubaccountPermissionsRequest;
import com.shop.platform.shop.dto.UpdateSubaccountStatusRequest;
import com.shop.platform.shop.service.ShopListItem;
import com.shop.platform.shop.service.ShopService;
import com.shop.platform.shop.service.ShopSubaccountService;
import com.shop.platform.shop.service.ShopView;
import com.shop.platform.shop.service.SubaccountItem;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * 卖家店铺管理（需登录）：开店 / 重提审核 / 我的店铺 / 子账号管理。
 *
 * <p>成功状态码按全仓既有口径给（与券 / 支付 / 地址 / 收藏等模块同一套，不新立第三套）：
 * <ul>
 *   <li><b>建出资源</b>（店铺、子账号）→ 201。审核通过的店之后重提、改名都不再新建资源，所以 {@code /resubmit} 是 200。</li>
 *   <li><b>删一行</b>的 DELETE → 204（移除子账号），与地址 / 商家地址 / 收藏 / 商品那几道删除同口径。</li>
 *   <li><b>状态推进与逐条索取</b>（停用/启用、重置口令、改权、取号码明文）→ 200 空体。</li>
 * </ul>
 *
 * <p>子账号的<b>认证</b>不在这里：登录 / 激活 / 刷新在 {@code /auth/subaccount/**}（只吃认证不吃授权），
 * 本控制器只管「店主怎么管它」。
 */
@Tag(name = "shops", description = "卖家店铺管理（需登录）")
@RestController
@RequestMapping("/shops")
@RequiredArgsConstructor
public class ShopController {

    private final ShopService shopService;
    private final ShopSubaccountService shopSubaccountService;

    /** 开店：当前登录用户（统一账号）创建店铺，落 PENDING_REVIEW 待平台审核 */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ShopView createShop(@CurrentUser UUID ownerId, @Valid @RequestBody CreateShopRequest req) {
        return ShopView.from(shopService.createShop(ownerId, req.name(), req.logoKey()));
    }

    /** 我的店铺列表（ACTIVE 成员身份）；被驳回的店带上驳回理由，供「补材料重新提交」表单 */
    @GetMapping("/mine")
    public List<ShopListItem> listMyShops(@CurrentUser UUID userId) {
        return shopService.myShops(userId);
    }

    /**
     * 被驳回的店铺重新提交审核：店主补材料（改店名 / logo）后把店推回待审核队列，入参与开店同形状。
     * 非被驳回的店拿 409，改名撞店名唯一闸拿 400 SHOP_NAME_TAKEN。
     */
    @PostMapping("/{shopId}/resubmit")
    public ShopView resubmitShopReview(
            @CurrentUser UUID userId, @PathVariable UUID shopId, @Valid @RequestBody CreateShopRequest req) {
        return ShopView.from(shopService.resubmitReview(shopId, userId, req.name(), req.logoKey()));
    }

    // ————————————————— 子账号管理（店主专属；子账号凭证在 account 域） —————————————————

    /**
     * 建子账号：店主设登录名 + 初始口令 + 员工手机号，落「待激活」——员工首次登录要用本人手机号收验证码
     * 才能启用（同店一个手机号只能绑一个子账号）。建号这一步不发短信。
     */
    @PostMapping("/{shopId}/subaccounts")
    @ResponseStatus(HttpStatus.CREATED)
    public SubaccountItem createSubaccount(
            @CurrentUser UUID ownerId, @PathVariable UUID shopId, @Valid @RequestBody CreateSubaccountRequest req) {
        return shopSubaccountService.create(
                shopId, ownerId, req.loginName(), req.phone(), req.password(), req.permissions());
    }

    /** 本店子账号列表（手机号恒掩码，明文走逐条索取端点） */
    @GetMapping("/{shopId}/subaccounts")
    public List<SubaccountItem> listSubaccounts(@CurrentUser UUID ownerId, @PathVariable UUID shopId) {
        return shopSubaccountService.list(shopId, ownerId);
    }

    /** 调整子账号权限（全量替换），下一请求即生效（判权每请求查库） */
    @PutMapping("/{shopId}/subaccounts/{subaccountId}/permissions")
    public void updateSubaccountPermissions(
            @CurrentUser UUID ownerId,
            @PathVariable UUID shopId,
            @PathVariable UUID subaccountId,
            @Valid @RequestBody UpdateSubaccountPermissionsRequest req) {
        shopSubaccountService.replacePermissions(shopId, ownerId, subaccountId, req.permissions());
    }

    /**
     * 停用 / 启用：停用 = 保留凭证、下一请求即失效、可解冻；启用对从没验过号的行回到「待激活」。
     * 与「移除」（删凭证行）是两件事。
     */
    @PatchMapping("/{shopId}/subaccounts/{subaccountId}/status")
    public void updateSubaccountStatus(
            @CurrentUser UUID ownerId,
            @PathVariable UUID shopId,
            @PathVariable UUID subaccountId,
            @Valid @RequestBody UpdateSubaccountStatusRequest req) {
        shopSubaccountService.setEnabled(shopId, ownerId, subaccountId, req.enabled());
    }

    /** 重置子账号口令（子账号没有短信自助找回）；成功即吊销该子账号全部设备的会话 */
    @PostMapping("/{shopId}/subaccounts/{subaccountId}/password")
    public void resetSubaccountPassword(
            @CurrentUser UUID ownerId,
            @PathVariable UUID shopId,
            @PathVariable UUID subaccountId,
            @Valid @RequestBody ResetSubaccountPasswordRequest req) {
        shopSubaccountService.resetPassword(shopId, ownerId, subaccountId, req.password());
    }

    /**
     * 取子账号手机号明文：列表里恒为掩码，真要拨号的场景走这一跳，逐条索取且每次留痕。
     * 闸门与列表同档（店主），越店与不存在同为 404。
     */
    @PostMapping("/{shopId}/subaccounts/{subaccountId}/phone")
    public PhoneRevealResponse revealSubaccountPhone(
            @CurrentUser UUID ownerId, @PathVariable UUID shopId, @PathVariable UUID subaccountId) {
        return new PhoneRevealResponse(shopSubaccountService.revealPhone(shopId, ownerId, subaccountId));
    }

    /** 移除子账号：删凭证行（与「停用」的区别是登录名与手机号占位一并释放） */
    @DeleteMapping("/{shopId}/subaccounts/{subaccountId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void removeSubaccount(
            @CurrentUser UUID ownerId, @PathVariable UUID shopId, @PathVariable UUID subaccountId) {
        shopSubaccountService.remove(shopId, ownerId, subaccountId);
    }
}
