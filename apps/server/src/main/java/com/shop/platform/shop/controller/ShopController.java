package com.shop.platform.shop.controller;

import com.shop.platform.common.UserIdHolder;
import com.shop.platform.shop.dto.CreateShopRequest;
import com.shop.platform.shop.dto.InviteMemberRequest;
import com.shop.platform.shop.dto.UpdateMemberPermissionsRequest;
import com.shop.platform.shop.mapper.Shop;
import com.shop.platform.shop.mapper.ShopMember;
import com.shop.platform.shop.service.ShopInviteItem;
import com.shop.platform.shop.service.ShopMemberItem;
import com.shop.platform.shop.service.ShopService;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "shops", description = "卖家店铺管理（需登录）")
@RestController
@RequestMapping("/shops")
@RequiredArgsConstructor
public class ShopController {

    private final ShopService shopService;

    /** 开店：当前登录用户（统一账号）创建店铺，落 PENDING_REVIEW 待平台审核 */
    @PostMapping
    public ShopResponse createShop(@Valid @RequestBody CreateShopRequest req) {
        UUID ownerId = UserIdHolder.get();
        return ShopResponse.from(shopService.createShop(ownerId, req.name(), req.logoKey()));
    }

    /** 我的店铺列表（ACTIVE 成员身份） */
    @GetMapping("/mine")
    public List<ShopResponse> listMyShops() {
        return ShopResponse.from(shopService.myShops(UserIdHolder.get()));
    }

    /** 我的待确认邀请 */
    @GetMapping("/invites")
    public List<ShopInviteItemResponse> listShopInvites() {
        return shopService.myInvites(UserIdHolder.get()).stream()
                .map(ShopInviteItemResponse::from)
                .toList();
    }

    /** 同意邀请，确认后成为店铺 ACTIVE 成员 */
    @PostMapping("/invites/{memberId}/accept")
    public ShopMemberResponse acceptShopInvite(@PathVariable UUID memberId) {
        return ShopMemberResponse.from(shopService.acceptInvite(memberId, UserIdHolder.get()));
    }

    /** 店铺成员列表（本店成员可见） */
    @GetMapping("/{shopId}/members")
    public List<ShopMemberItemResponse> listShopMembers(@PathVariable UUID shopId) {
        return shopService.members(shopId, UserIdHolder.get()).stream()
                .map(ShopMemberItemResponse::from)
                .toList();
    }

    /** 店主按手机号邀请成员（可选携带可授予权限码），对方登录后确认才生效 */
    @PostMapping("/{shopId}/invites")
    public ShopMemberResponse inviteShopMember(@PathVariable UUID shopId, @Valid @RequestBody InviteMemberRequest req) {
        return ShopMemberResponse.from(shopService.invite(shopId, UserIdHolder.get(), req.phone(), req.permissions()));
    }

    /** 店主调整子账号权限（全量替换），下一请求即生效 */
    @PutMapping("/{shopId}/members/{memberId}/permissions")
    public void updateShopMemberPermissions(
            @PathVariable UUID shopId,
            @PathVariable UUID memberId,
            @Valid @RequestBody UpdateMemberPermissionsRequest req) {
        shopService.updatePermissions(shopId, memberId, UserIdHolder.get(), req.permissions());
    }

    /** 店主移除成员 */
    @DeleteMapping("/{shopId}/members/{memberId}")
    public void removeShopMember(@PathVariable UUID shopId, @PathVariable UUID memberId) {
        shopService.removeMember(shopId, memberId, UserIdHolder.get());
    }

    /** 店铺出参：字段镜像实体现状（前端 ShopSchema 严格校验，只减不增） */
    public record ShopResponse(
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID ownerId,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String name,
            String logoKey,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String status,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) OffsetDateTime createdAt,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) OffsetDateTime updatedAt) {

        static ShopResponse from(Shop shop) {
            return new ShopResponse(
                    shop.getId(),
                    shop.getOwnerId(),
                    shop.getName(),
                    shop.getLogoKey(),
                    shop.getStatus(),
                    shop.getCreatedAt(),
                    shop.getUpdatedAt());
        }

        static List<ShopResponse> from(List<Shop> list) {
            return list.stream().map(ShopResponse::from).toList();
        }
    }

    /** 成员出参：invite/accept 返回，前端 ShopMemberSchema 逐字段校验；permissions 为被授予码（OWNER 空集） */
    public record ShopMemberResponse(
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID shopId,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID userId,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String role,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String status,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) List<String> permissions,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) OffsetDateTime createdAt,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) OffsetDateTime updatedAt) {

        static ShopMemberResponse from(ShopMember member) {
            return new ShopMemberResponse(
                    member.getId(),
                    member.getShopId(),
                    member.getUserId(),
                    member.getRole(),
                    member.getStatus(),
                    member.getPermissions(),
                    member.getCreatedAt(),
                    member.getUpdatedAt());
        }
    }

    /** 邀请列表项出参：镜像 service 的 ShopInviteItem，字段只减不增 */
    public record ShopInviteItemResponse(UUID memberId, UUID shopId, String shopName, OffsetDateTime createdAt) {

        static ShopInviteItemResponse from(ShopInviteItem item) {
            return new ShopInviteItemResponse(item.memberId(), item.shopId(), item.shopName(), item.createdAt());
        }
    }

    /** 成员列表项出参：镜像 service 的 ShopMemberItem（含跨 schema 拼装的手机号 + 权限码），字段只减不增 */
    public record ShopMemberItemResponse(
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID memberId,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID userId,
            String phone,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String role,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String status,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) List<String> permissions) {

        static ShopMemberItemResponse from(ShopMemberItem item) {
            return new ShopMemberItemResponse(
                    item.memberId(), item.userId(), item.phone(), item.role(), item.status(), item.permissions());
        }
    }
}
