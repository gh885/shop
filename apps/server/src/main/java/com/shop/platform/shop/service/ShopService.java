package com.shop.platform.shop.service;

import com.shop.platform.common.Validate;
import com.shop.platform.shop.events.ShopCreatedEvent;
import com.shop.platform.shop.mapper.Shop;
import com.shop.platform.shop.mapper.ShopMapper;
import com.shop.platform.shop.mapper.ShopMember;
import com.shop.platform.shop.mapper.ShopMemberMapper;
import java.util.UUID;
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
                .status(Shop.STATUS_PENDING_REVIEW)
                .build();
        shopMapper.insert(shop);

        // 3. 店主自动成为 OWNER 成员（授权判断以 shop_members 为准）
        ShopMember owner = ShopMember.builder()
                .shopId(shop.getId())
                .userId(ownerId)
                .role(ShopMember.ROLE_OWNER)
                .status(ShopMember.STATUS_ACTIVE)
                .build();
        shopMemberMapper.insert(owner);

        // 4. 发布事件 → admin 模块入队审核（跨模块，事件驱动解耦）
        events.publishEvent(new ShopCreatedEvent(shop.getId(), ownerId));
        log.info("[SHOP] 开店成功, shopId={}, ownerId={}", shop.getId(), ownerId);
        return shop;
    }
}
