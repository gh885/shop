package com.shop.platform.shop.controller;

import com.shop.platform.common.UserIdHolder;
import com.shop.platform.shop.dto.CreateShopRequest;
import com.shop.platform.shop.dto.InviteMemberRequest;
import com.shop.platform.shop.mapper.Shop;
import com.shop.platform.shop.mapper.ShopMember;
import com.shop.platform.shop.service.ShopInviteItem;
import com.shop.platform.shop.service.ShopMemberItem;
import com.shop.platform.shop.service.ShopService;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/shops")
@RequiredArgsConstructor
public class ShopController {

    private final ShopService shopService;

    /** 开店：当前登录用户（统一账号）创建店铺，落 PENDING_REVIEW 待平台审核 */
    @PostMapping
    public Shop create(@Valid @RequestBody CreateShopRequest req) {
        UUID ownerId = UserIdHolder.get();
        return shopService.createShop(ownerId, req.name(), req.logoKey());
    }

    /** 我的店铺列表（ACTIVE 成员身份） */
    @GetMapping("/mine")
    public List<Shop> mine() {
        return shopService.myShops(UserIdHolder.get());
    }

    /** 我的待确认邀请 */
    @GetMapping("/invites")
    public List<ShopInviteItem> invites() {
        return shopService.myInvites(UserIdHolder.get());
    }

    /** 同意邀请，确认后成为店铺 ACTIVE 成员 */
    @PostMapping("/invites/{memberId}/accept")
    public ShopMember acceptInvite(@PathVariable UUID memberId) {
        return shopService.acceptInvite(memberId, UserIdHolder.get());
    }

    /** 店铺成员列表（本店成员可见） */
    @GetMapping("/{shopId}/members")
    public List<ShopMemberItem> members(@PathVariable UUID shopId) {
        return shopService.members(shopId, UserIdHolder.get());
    }

    /** 店主按手机号邀请成员，对方登录后确认才生效 */
    @PostMapping("/{shopId}/invites")
    public ShopMember invite(@PathVariable UUID shopId, @Valid @RequestBody InviteMemberRequest req) {
        return shopService.invite(shopId, UserIdHolder.get(), req.phone());
    }

    /** 店主移除成员 */
    @DeleteMapping("/{shopId}/members/{memberId}")
    public void removeMember(@PathVariable UUID shopId, @PathVariable UUID memberId) {
        shopService.removeMember(shopId, memberId, UserIdHolder.get());
    }
}
