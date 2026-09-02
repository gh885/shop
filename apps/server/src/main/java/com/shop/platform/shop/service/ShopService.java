package com.shop.platform.shop.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.shop.platform.auth.api.UserReadQuery;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.Validate;
import com.shop.platform.shop.events.ShopCreatedEvent;
import com.shop.platform.shop.mapper.Shop;
import com.shop.platform.shop.mapper.ShopMapper;
import com.shop.platform.shop.mapper.ShopMember;
import com.shop.platform.shop.mapper.ShopMemberMapper;
import com.shop.platform.shop.model.MemberRole;
import com.shop.platform.shop.model.MemberStatus;
import com.shop.platform.shop.model.ShopStatus;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Slf4j
@RequiredArgsConstructor
public class ShopService {

    private final ShopMapper shopMapper;
    private final ShopMemberMapper shopMemberMapper;
    private final ApplicationEventPublisher events;
    private final UserReadQuery userReadQuery;

    /** 开店：建店（PENDING_REVIEW）+ 店主成为 OWNER 成员 + 发布审核事件 */
    @Transactional
    public Shop createShop(UUID ownerId, String name, String logoKey) {
        // 1. 校验店名（controller 已 @Valid，service 兜底）
        Validate.isTrue(name != null && !name.isBlank(), "店名不能为空");

        // 2. 建店：先落 PENDING_REVIEW，平台审核通过才 ACTIVE
        Shop shop = Shop.builder()
                .ownerId(ownerId)
                .name(name)
                .logoKey(logoKey)
                .status(ShopStatus.PENDING_REVIEW)
                .build();
        shopMapper.insert(shop);

        // 3. 店主自动成为 OWNER 成员（授权判断以 shop_members 为准）
        ShopMember owner = ShopMember.builder()
                .shopId(shop.getId())
                .userId(ownerId)
                .role(MemberRole.OWNER)
                .status(MemberStatus.ACTIVE)
                .build();
        shopMemberMapper.insert(owner);

        // 4. 发布事件 → admin 模块入队审核（跨模块，事件驱动解耦）
        events.publishEvent(new ShopCreatedEvent(shop.getId(), ownerId));
        log.info("[SHOP] 开店成功, shopId={}, ownerId={}", shop.getId(), ownerId);
        return shop;
    }

    // ========== 我的店铺与邀请 ==========

    /** 我的店铺列表：当前用户 ACTIVE 成员身份对应的全部店铺，新店在前 */
    public List<Shop> myShops(UUID userId) {
        List<UUID> shopIds = shopMemberMapper.selectActiveByUser(userId).stream()
                .map(ShopMember::getShopId)
                .toList();
        if (shopIds.isEmpty()) return List.of();
        return shopMapper.selectList(
                new LambdaQueryWrapper<Shop>().in(Shop::getId, shopIds).orderByDesc(Shop::getCreatedAt));
    }

    /** 我的待确认邀请：别人邀我、等我同意的成员记录，拼上店名 */
    public List<ShopInviteItem> myInvites(UUID userId) {
        List<ShopMember> pending = shopMemberMapper.selectPendingByUser(userId);
        if (pending.isEmpty()) return List.of();

        Map<UUID, Shop> shops = shopMapper
                .selectList(new LambdaQueryWrapper<Shop>()
                        .in(
                                Shop::getId,
                                pending.stream().map(ShopMember::getShopId).toList()))
                .stream()
                .collect(Collectors.toMap(Shop::getId, Function.identity()));
        return pending.stream()
                .map(m -> new ShopInviteItem(
                        m.getId(),
                        m.getShopId(),
                        shops.containsKey(m.getShopId())
                                ? shops.get(m.getShopId()).getName()
                                : null,
                        m.getCreatedAt()))
                .toList();
    }

    /** 同意邀请：只能确认发给自己的 PENDING 邀请，确认后 ACTIVE 生效 */
    @Transactional
    public ShopMember acceptInvite(UUID memberId, UUID userId) {
        ShopMember member = Validate.notNull(shopMemberMapper.selectById(memberId), "邀请不存在或已失效");
        Validate.isTrue(member.getUserId().equals(userId), "不能确认发给别人的邀请");
        Validate.isTrue(MemberStatus.PENDING.equals(member.getStatus()), "该邀请已处理");
        member.setStatus(MemberStatus.ACTIVE);
        shopMemberMapper.updateById(member);
        log.info("[SHOP] 成员确认加入, shopId={}, userId={}", member.getShopId(), userId);
        return member;
    }

    // ========== 买家侧公开读 ==========

    /** 店铺公开信息：仅 ACTIVE 可见。待审核/被拒/封禁的店对买家一律 404，不泄露"存在但不可用" */
    public Shop publicShop(UUID shopId) {
        Shop shop = Validate.notNull(shopMapper.selectById(shopId), "店铺不存在");
        Validate.isTrue(shop.isActive(), 404, "店铺不存在");
        return shop;
    }

    // ========== 成员管理（店主操作） ==========

    /** 店铺成员列表：仅本店 ACTIVE 成员可见，拼上成员手机号（跨 schema 只读按 ID 查，禁止 JOIN） */
    public List<ShopMemberItem> members(UUID shopId, UUID operatorId) {
        requireActiveMember(shopId, operatorId);
        List<ShopMember> members = shopMemberMapper.selectByShop(shopId);
        Map<UUID, String> phones = userReadQuery.phonesByIds(
                members.stream().map(ShopMember::getUserId).distinct().toList());
        return members.stream()
                .map(m -> new ShopMemberItem(
                        m.getId(),
                        m.getUserId(),
                        phones.get(m.getUserId()),
                        m.getRole(),
                        m.getStatus(),
                        m.getPermissions()))
                .toList();
    }

    /** 店主邀请成员：按手机号找人，落 PENDING 等对方登录后确认（可选携带可授予权限码，默认空集） */
    @Transactional
    public ShopMember invite(UUID shopId, UUID ownerId, String phone, List<String> permissions) {
        // 1. 校验操作者是店主
        requireOwner(shopId, ownerId);

        // 2. 按手机号找人（auth :: api 只读，auth.users 全局唯一手机号）
        UUID inviteeId = Validate.present(userReadQuery.findIdByPhone(phone), 400, "该手机号还未注册");
        if (inviteeId.equals(ownerId)) {
            throw BusinessException.badRequest("不能邀请自己");
        }

        // 3. 防重：同店同人只能有一条成员记录（唯一索引 uk_shop_members_shop_user 兜底并发）
        if (shopMemberMapper.existsByShopAndUser(shopId, inviteeId)) {
            throw BusinessException.conflict(null, "对方已是店铺成员或已有待确认邀请");
        }

        // 4. 白名单校验后落 PENDING 邀请（最小权限：不传 = 空集），等对方确认
        List<String> grants = SellerGrants.sanitize(permissions);
        ShopMember member = ShopMember.builder()
                .shopId(shopId)
                .userId(inviteeId)
                .role(MemberRole.MEMBER)
                .status(MemberStatus.PENDING)
                .permissions(grants)
                .build();
        shopMemberMapper.insert(member);
        log.info("[SHOP] 邀请成员, shopId={}, invitee={}, grants={}", shopId, inviteeId, grants);
        return member;
    }

    /** 店主调整子账号权限（全量替换）：OWNER 权限固有不可改；下一请求即生效（判权实时查库） */
    @Transactional
    public void updatePermissions(UUID shopId, UUID memberId, UUID operatorId, List<String> permissions) {
        // 1. 只有店主可调权
        requireOwner(shopId, operatorId);

        // 2. 目标必须是本店 MEMBER（OWNER 权限固有，不存在“改店主权限”）
        ShopMember member = Validate.notNull(shopMemberMapper.selectById(memberId), "成员不存在");
        Validate.isTrue(member.getShopId().equals(shopId), "成员不属于该店铺");
        Validate.isTrue(MemberRole.MEMBER.equals(member.getRole()), "不能修改店主的权限");

        // 3. 白名单校验后全量替换
        member.setPermissions(SellerGrants.sanitize(permissions));
        shopMemberMapper.updateById(member);
        log.info("[SHOP] 调整成员权限, shopId={}, memberId={}, permissions={}", shopId, memberId, member.getPermissions());
    }

    /** 店主移除成员：不能移除自己（店主身份随店铺存续） */
    @Transactional
    public void removeMember(UUID shopId, UUID memberId, UUID ownerId) {
        requireOwner(shopId, ownerId);
        ShopMember member = Validate.notNull(shopMemberMapper.selectById(memberId), "成员不存在");
        Validate.isTrue(member.getShopId().equals(shopId), "成员不属于该店铺");
        if (MemberRole.OWNER.equals(member.getRole())) {
            throw BusinessException.badRequest("不能移除店主");
        }
        shopMemberMapper.deleteById(memberId);
        log.info("[SHOP] 移除成员, shopId={}, memberId={}", shopId, memberId);
    }

    // ========== 内部 ==========

    /** 当前用户是否为该店店主，不是则 403 */
    private void requireOwner(UUID shopId, UUID userId) {
        if (!shopMemberMapper.isActiveOwner(shopId, userId)) {
            throw BusinessException.forbidden("只有店主可以执行该操作");
        }
    }

    /** 当前用户是否为该店 ACTIVE 成员，不是则 403 */
    private void requireActiveMember(UUID shopId, UUID userId) {
        if (!shopMemberMapper.isActiveMember(shopId, userId)) {
            throw BusinessException.forbidden("你不是该店铺成员");
        }
    }
}
