package com.shop.platform.admin.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.shop.platform.admin.mapper.ShopReview;
import com.shop.platform.admin.mapper.ShopReviewMapper;
import com.shop.platform.common.PageResult;
import com.shop.platform.common.Validate;
import com.shop.platform.shop.events.ShopCreatedEvent;
import com.shop.platform.shop.events.ShopReviewDecidedEvent;
import java.time.OffsetDateTime;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 店铺入驻审核：待审队列 + 通过/拒绝留痕，店名/店主手机号跨 schema 只读拼装（禁止 JOIN）。 */
@Service
@Slf4j
@RequiredArgsConstructor
public class ShopReviewService {

    private final ShopReviewMapper shopReviewMapper;
    private final JdbcTemplate jdbc;
    private final ApplicationEventPublisher events;

    // ========== 审核队列 ==========

    /** 审核列表（按 status 筛选分页，含店名/店主手机号） */
    public PageResult<ShopReviewItem> pageList(String status, long page, long size) {
        // 1. 分页查审核记录，PENDING 优先、新店在前
        Page<ShopReview> rows = shopReviewMapper.selectPage(
                new Page<>(page, size),
                new LambdaQueryWrapper<ShopReview>()
                        .eq(status != null && !status.isBlank(), ShopReview::getStatus, status)
                        .orderByAsc(ShopReview::getStatus)
                        .orderByDesc(ShopReview::getCreatedAt));

        // 2. 空页直接返回（避免拼空 IN 列表）
        if (rows.getRecords().isEmpty()) {
            return new PageResult<>(List.of(), rows.getTotal());
        }

        // 3. 跨 schema 只读拼装：店名 + 店主手机号
        List<UUID> shopIds =
                rows.getRecords().stream().map(ShopReview::getShopId).distinct().toList();
        Map<UUID, String> shopNames = loadShopNames(shopIds);
        Map<UUID, String> ownerPhones = loadOwnerPhones(shopIds);

        // 4. 拼装出参
        List<ShopReviewItem> items = rows.getRecords().stream()
                .map(r -> new ShopReviewItem(
                        r.getId(),
                        r.getShopId(),
                        shopNames.get(r.getShopId()),
                        ownerPhones.get(r.getShopId()),
                        r.getStatus(),
                        r.getReason(),
                        r.getDecidedAt(),
                        r.getCreatedAt()))
                .toList();
        return new PageResult<>(items, rows.getTotal());
    }

    // ========== 审批 ==========

    @Transactional
    public ShopReview approve(UUID reviewId, UUID staffId) {
        return decide(reviewId, staffId, ShopReview.STATUS_APPROVED, null);
    }

    @Transactional
    public ShopReview reject(UUID reviewId, UUID staffId, String reason) {
        return decide(reviewId, staffId, ShopReview.STATUS_REJECTED, reason);
    }

    private ShopReview decide(UUID reviewId, UUID staffId, String newStatus, String reason) {
        // 1. 校验存在且未审
        ShopReview review = Validate.notNull(shopReviewMapper.selectById(reviewId), "审核记录不存在");
        Validate.isTrue(ShopReview.STATUS_PENDING.equals(review.getStatus()), "该店铺已审核，请刷新列表");

        // 2. 写入审批留痕（谁批的、批没批、理由、时间）
        review.setStatus(newStatus);
        review.setStaffId(staffId);
        review.setReason(reason);
        review.setDecidedAt(OffsetDateTime.now());
        shopReviewMapper.updateById(review);

        // 3. 发审核决定事件 → shop 模块改店铺状态
        events.publishEvent(
                new ShopReviewDecidedEvent(review.getShopId(), ShopReview.STATUS_APPROVED.equals(newStatus), reason));
        log.info("[ADMIN] 店铺审核决定, shopId={}, status={}, staffId={}", review.getShopId(), newStatus, staffId);
        return review;
    }

    // ========== 事件监听 ==========

    /** shop 开店后入队一条 PENDING 审核（事件驱动，跨模块） */
    @ApplicationModuleListener
    public void onShopCreated(ShopCreatedEvent event) {
        ShopReview review = ShopReview.builder()
                .shopId(event.shopId())
                .status(ShopReview.STATUS_PENDING)
                .build();
        shopReviewMapper.insert(review);
        log.info("[ADMIN] 新店待审入队, shopId={}", event.shopId());
    }

    // ========== 跨 schema 只读拼装 ==========

    /** shopId → 店名 */
    private Map<UUID, String> loadShopNames(List<UUID> shopIds) {
        return queryPairs("shop.shops", shopIds, "name");
    }

    /** shopId → 店主手机号：先取 shop.owner_id，再按 auth.users.id 查 phone（两步，禁止 JOIN） */
    private Map<UUID, String> loadOwnerPhones(List<UUID> shopIds) {
        String in = placeholders(shopIds);
        Map<UUID, UUID> owners = jdbc.query(
                "SELECT id, owner_id FROM shop.shops WHERE id IN (" + in + ")",
                rs -> {
                    Map<UUID, UUID> map = new HashMap<>();
                    while (rs.next()) {
                        map.put(rs.getObject("id", UUID.class), rs.getObject("owner_id", UUID.class));
                    }
                    return map;
                },
                shopIds.toArray());
        if (owners.isEmpty()) return Map.of();

        List<UUID> ownerIds = owners.values().stream().distinct().toList();
        Map<UUID, String> phones = queryPairs("auth.users", ownerIds, "phone");

        Map<UUID, String> result = new HashMap<>();
        owners.forEach((shopId, ownerId) -> result.put(shopId, phones.get(ownerId)));
        return result;
    }

    /** 按 ID 批量查单字段：SELECT id, <column> FROM <table> WHERE id IN (...) */
    private Map<UUID, String> queryPairs(String table, List<UUID> ids, String column) {
        String in = placeholders(ids);
        return jdbc.query(
                "SELECT id, " + column + " FROM " + table + " WHERE id IN (" + in + ")",
                rs -> {
                    Map<UUID, String> map = new HashMap<>();
                    while (rs.next()) {
                        map.put(rs.getObject("id", UUID.class), rs.getString(column));
                    }
                    return map;
                },
                ids.toArray());
    }

    private static String placeholders(List<UUID> ids) {
        return String.join(",", Collections.nCopies(ids.size(), "?"));
    }
}
