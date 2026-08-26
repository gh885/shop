package com.shop.platform.admin.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.shop.platform.admin.mapper.ShopReview;
import com.shop.platform.admin.mapper.ShopReviewMapper;
import com.shop.platform.auth.api.UserReadQuery;
import com.shop.platform.common.PageParams;
import com.shop.platform.common.PageResult;
import com.shop.platform.common.Validate;
import com.shop.platform.shop.api.ShopReadQuery;
import com.shop.platform.shop.events.ShopCreatedEvent;
import com.shop.platform.shop.events.ShopReviewDecidedEvent;
import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.slf4j.MDC;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/** 店铺入驻审核：待审队列 + 通过/拒绝留痕，店名/店主手机号经 shop / auth 的 api 包只读拼装（禁止 JOIN）。 */
@Service
@Slf4j
@RequiredArgsConstructor
public class ShopReviewService {

    private final ShopReviewMapper shopReviewMapper;
    private final ShopReadQuery shopReadQuery;
    private final UserReadQuery userReadQuery;
    private final ApplicationEventPublisher events;

    // ========== 审核队列 ==========

    /** 审核列表（按 status 筛选分页，含店名/店主手机号） */
    public PageResult<ShopReviewItem> pageList(PageParams pageParams, String status) {
        // 1. 分页查审核记录，PENDING 优先、新店在前
        Page<ShopReview> rows = shopReviewMapper.selectPage(
                new Page<>(pageParams.page(), pageParams.size()),
                new LambdaQueryWrapper<ShopReview>()
                        .eq(status != null && !status.isBlank(), ShopReview::getStatus, status)
                        .orderByAsc(ShopReview::getStatus)
                        .orderByDesc(ShopReview::getCreatedAt));

        // 2. 空页直接返回（避免拼空 IN 列表）
        if (rows.getRecords().isEmpty()) {
            return new PageResult<>(List.of(), rows.getTotal());
        }

        // 3. 跨模块只读拼装（shop / auth 的 api 包）：店名 + 店主手机号
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

        // 4. L3 审计留痕（结构化事件，约定见 docs/business-event-logging.md）
        MDC.put("event", "shop_review.decided");
        MDC.put("review_id", review.getId().toString());
        MDC.put("shop_id", review.getShopId().toString());
        MDC.put("decision", newStatus);
        MDC.put("staff_id", staffId.toString());
        try {
            log.info("");
        } finally {
            MDC.remove("event");
            MDC.remove("review_id");
            MDC.remove("shop_id");
            MDC.remove("decision");
            MDC.remove("staff_id");
        }
        return review;
    }

    // ========== 事件监听 ==========

    /**
     * shop 开店后入队一条 PENDING 审核（纯通知，at-least-once）。
     *
     * <p>提交后同线程同步消费 + REQUIRES_NEW 独立事务。刻意不用 @Async：线程池队列在内存里，
     * 崩溃丢任务；afterCommit 阶段原事务已提交，不开新事务的写入会被连接池回滚，REQUIRES_NEW 也是必须的。
     *
     * <p>可靠性由 kernel.event_publication 登记（与开店事务原子落库）+ 重启补发 +
     * EventPublicationRecoveryJob 定期重投兜底：崩溃留 PUBLISHED/PROCESSING、消费抛错标 FAILED，均自动重投。
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onShopCreated(ShopCreatedEvent event) {
        ShopReview review = ShopReview.builder()
                .shopId(event.shopId())
                .status(ShopReview.STATUS_PENDING)
                .build();
        shopReviewMapper.insert(review);
        log.info("[ADMIN] 新店待审入队, shopId={}", event.shopId());
    }

    // ========== 跨模块只读拼装（经 shop / auth 的 api 包，禁止 JOIN） ==========

    /** shopId → 店名 */
    private Map<UUID, String> loadShopNames(List<UUID> shopIds) {
        return shopReadQuery.namesByIds(shopIds);
    }

    /** shopId → 店主手机号：先取 shop.owner_id，再按 auth.users.id 查 phone（两步，禁止 JOIN） */
    private Map<UUID, String> loadOwnerPhones(List<UUID> shopIds) {
        Map<UUID, UUID> owners = shopReadQuery.ownerIdsByShops(shopIds);
        if (owners.isEmpty()) return Map.of();

        List<UUID> ownerIds = owners.values().stream().distinct().toList();
        Map<UUID, String> phones = userReadQuery.phonesByIds(ownerIds);

        Map<UUID, String> result = new HashMap<>();
        owners.forEach((shopId, ownerId) -> result.put(shopId, phones.get(ownerId)));
        return result;
    }
}
