package com.shop.platform.shop.controller;

import com.shop.platform.infra.web.CurrentUser;
import com.shop.platform.shop.controller.response.PhoneRevealResponse;
import com.shop.platform.shop.dto.CreateShopRequest;
import com.shop.platform.shop.dto.InviteMemberRequest;
import com.shop.platform.shop.dto.UpdateMemberPermissionsRequest;
import com.shop.platform.shop.service.ShopInviteItem;
import com.shop.platform.shop.service.ShopListItem;
import com.shop.platform.shop.service.ShopMemberItem;
import com.shop.platform.shop.service.ShopMemberView;
import com.shop.platform.shop.service.ShopService;
import com.shop.platform.shop.service.ShopView;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * 卖家店铺管理（需登录）。
 *
 * <p>成功状态码按全仓既有口径给（与券 / 支付 / 地址 / 收藏等模块同一套，不新立第三套）：
 * <ul>
 *   <li><b>建出「店铺」这个资源</b> → 201（开店）。审核通过的店之后重提、改名都不再新建资源，所以 {@code /resubmit} 是 200。</li>
 *   <li><b>删一行</b>的 DELETE → 204（移除成员），与地址 / 商家地址 / 收藏 / 商品那几道删除同口径（软删还是硬删不改状态码，改的是行还在不在）。</li>
 *   <li><b>状态推进与逐条索取</b>（发起邀请、接受 / 拒绝邀请、改权限、取电话明文）→ 200。邀请那一组刻意不给 204：
 *       204 等于对任意 memberId 承认「这行存在、而且已被你处理」，邀请 ID 因此可被枚举——ACC-10 把 accept / decline
 *       钉在同一档（缺席与越权同为 404「邀请不存在或已失效」，重复处理 409），{@code invites} 与它们同一条流，
 *       把一对拆成两种码比全都留 200 更糟。</li>
 * </ul>
 */
@Tag(name = "shops", description = "卖家店铺管理（需登录）")
@RestController
@RequestMapping("/shops")
@RequiredArgsConstructor
public class ShopController {

    private final ShopService shopService;

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

    /** 我的待确认邀请 */
    @GetMapping("/invites")
    public List<ShopInviteItem> listShopInvites(@CurrentUser UUID userId) {
        return shopService.myInvites(userId);
    }

    /** 同意邀请，确认后成为店铺 ACTIVE 成员 */
    @PostMapping("/invites/{memberId}/accept")
    public ShopMemberView acceptShopInvite(@CurrentUser UUID userId, @PathVariable UUID memberId) {
        return ShopMemberView.from(shopService.acceptInvite(memberId, userId));
    }

    /**
     * 拒绝邀请：被邀请人本人拒掉发给自己的待确认邀请，成员行直接删除（不留 DECLINED 态），
     * 因此该用户之后可被再次邀请。空响应（200）；重复拒绝与别人的邀请 ID 同为 404「邀请不存在或已失效」，
     * 已同意后拒绝拿 409「该邀请已处理」。
     */
    @PostMapping("/invites/{memberId}/decline")
    public void declineShopInvite(@CurrentUser UUID userId, @PathVariable UUID memberId) {
        shopService.declineInvite(memberId, userId);
    }

    /** 店铺成员列表（本店成员可见）：手机号除本人那行外都是掩码 */
    @GetMapping("/{shopId}/members")
    public List<ShopMemberItem> listShopMembers(@CurrentUser UUID userId, @PathVariable UUID shopId) {
        return shopService.members(shopId, userId);
    }

    /**
     * 查看成员电话明文：列表里别人的号恒为掩码，真要拨号的场景走这一跳，逐条索取且每次留痕。
     * 闸门与列表同档（本店 ACTIVE 成员），越店与不存在同为 404。
     */
    @PostMapping("/{shopId}/members/{memberId}/phone")
    public PhoneRevealResponse revealMemberPhone(
            @CurrentUser UUID userId, @PathVariable UUID shopId, @PathVariable UUID memberId) {
        return new PhoneRevealResponse(shopService.memberPhone(shopId, memberId, userId));
    }

    /** 店主按手机号邀请成员（可选携带可授予权限码），对方登录后确认才生效 */
    @PostMapping("/{shopId}/invites")
    public ShopMemberView inviteShopMember(
            @CurrentUser UUID userId, @PathVariable UUID shopId, @Valid @RequestBody InviteMemberRequest req) {
        return ShopMemberView.from(shopService.invite(shopId, userId, req.phone(), req.permissions()));
    }

    /** 店主调整子账号权限（全量替换），下一请求即生效 */
    @PutMapping("/{shopId}/members/{memberId}/permissions")
    public void updateShopMemberPermissions(
            @CurrentUser UUID userId,
            @PathVariable UUID shopId,
            @PathVariable UUID memberId,
            @Valid @RequestBody UpdateMemberPermissionsRequest req) {
        shopService.updatePermissions(shopId, memberId, userId, req.permissions());
    }

    /** 店主移除成员 */
    @DeleteMapping("/{shopId}/members/{memberId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void removeShopMember(@CurrentUser UUID userId, @PathVariable UUID shopId, @PathVariable UUID memberId) {
        shopService.removeMember(shopId, memberId, userId);
    }
}
