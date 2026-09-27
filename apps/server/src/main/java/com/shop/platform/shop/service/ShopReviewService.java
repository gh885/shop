package com.shop.platform.shop.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.shop.platform.account.api.StaffReadQuery;
import com.shop.platform.account.api.UserReadQuery;
import com.shop.platform.audit.api.AuditAction;
import com.shop.platform.audit.api.RecordAuditCommand;
import com.shop.platform.common.PageParams;
import com.shop.platform.common.PageResult;
import com.shop.platform.common.PhoneNumber;
import com.shop.platform.common.Validate;
import com.shop.platform.infra.observability.BizEvent;
import com.shop.platform.shop.events.ShopTradingSuspendedEvent;
import com.shop.platform.shop.mapper.Shop;
import com.shop.platform.shop.mapper.ShopMapper;
import com.shop.platform.shop.mapper.ShopReview;
import com.shop.platform.shop.mapper.ShopReviewMapper;
import com.shop.platform.shop.model.ShopReviewStatus;
import com.shop.platform.shop.model.ShopStatus;
import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 店铺入驻审核（平台员工侧）：待审队列 + 通过/拒绝留痕并同事务推进店铺状态。
 * 入队由 ShopService.createShop 与建店同事务完成；店主手机号经 account :: api 只读拼装（禁止 JOIN）。
 *
 * <p>驳回即店铺停止营业：与状态推进同事务发布 {@link ShopTradingSuspendedEvent}，product 监听把该店在架商品级联下架。
 * 将来若加「平台禁用店铺」的入口（DISABLED 目前无写入方），那条流转必须发布同一个事件——级联的判据是「店不营业了」，
 * 不是「审核被拒」这条具体路径。
 */
@Service
@RequiredArgsConstructor
public class ShopReviewService {

    private final ShopReviewMapper shopReviewMapper;
    private final ShopMapper shopMapper;
    private final UserReadQuery userReadQuery;
    private final ApplicationEventPublisher events;
    private final RecordAuditCommand recordAuditCommand;
    private final StaffReadQuery staffReadQuery;

    // 审核队列
    /** 审核列表（按 status 筛选分页，含店名/店主手机号；号码恒为掩码，明文走 {@link #ownerPhone}） */
    public PageResult<ShopReviewItem> pageList(PageParams pageParams, String status) {
        // 1. 分页查审核记录：待审优先、同档新店在前（档位口径见 ACC-08，排序键在 mapper）
        ShopReviewStatus filter = Validate.enumFilter(ShopReviewStatus.class, status, "非法的审核状态筛选值");
        Page<ShopReview> rows = shopReviewMapper.selectQueuePage(pageParams, filter);

        // 2. 空页直接返回（避免拼空 IN 列表）
        if (rows.getRecords().isEmpty()) {
            return new PageResult<>(List.of(), rows.getTotal());
        }

        // 3. 拼装：店名/店主取本模块的店铺行；店主手机号经 account :: api 按 ID 查（禁止 JOIN）
        List<UUID> shopIds =
                rows.getRecords().stream().map(ShopReview::getShopId).distinct().toList();
        Map<UUID, Shop> shops =
                shopMapper.selectBatchIds(shopIds).stream().collect(Collectors.toMap(Shop::getId, Function.identity()));
        Map<UUID, String> ownerPhones = loadOwnerPhones(shops);

        // 4. 拼装出参
        List<ShopReviewItem> items = rows.getRecords().stream()
                .map(r -> new ShopReviewItem(
                        r.getId(),
                        r.getShopId(),
                        shops.containsKey(r.getShopId())
                                ? shops.get(r.getShopId()).getName()
                                : null,
                        PhoneNumber.mask(ownerPhones.get(r.getShopId())),
                        r.getStatus(),
                        r.getReason(),
                        r.getDecidedAt(),
                        r.getCreatedAt()))
                .toList();
        return new PageResult<>(items, rows.getTotal());
    }

    /**
     * 平台查看店主电话明文：审核队列是批量出口，号码恒为掩码（GEN-51），真要打电话核实资质的场景走这一跳，
     * 逐条索取、每次留痕（记「哪个员工看了哪家店的店主号」，号码本身不进日志）。
     * 审核记录/店铺/店主账号任一缺席同为 404，不给「存在但拿不到号」的中间态。
     */
    @Transactional(readOnly = true)
    public String ownerPhone(UUID reviewId, UUID staffId) {
        // 1. 审核记录 → 店铺 → 店主账号，三步都按主键点查（不 JOIN）
        ShopReview review = Validate.notNull(shopReviewMapper.selectById(reviewId), "审核记录不存在");
        Shop shop = Validate.notNull(shopMapper.selectById(review.getShopId()), "店铺不存在");
        String phone = Validate.present(userReadQuery.phoneById(shop.getOwnerId()), "店主账号不存在");

        // 2. L3 取用留痕（结构化事件，约定见 docs/conventions/business-event-logging.md）
        BizEvent.of("shop_review.owner_phone_revealed")
                .put("review_id", reviewId)
                .put("shop_id", shop.getId())
                .put("staff_id", staffId)
                .emit();
        return phone;
    }

    // 审批
    @Transactional
    public ShopReview approve(UUID reviewId, UUID staffId) {
        return decide(reviewId, staffId, ShopReviewStatus.APPROVED, null);
    }

    @Transactional
    public ShopReview reject(UUID reviewId, UUID staffId, String reason) {
        return decide(reviewId, staffId, ShopReviewStatus.REJECTED, reason);
    }

    /**
     * 审批的唯一落点：留痕（谁批的、批没批、理由、时间）与店铺状态推进是一个逻辑单元，同事务原子生效——
     * 店铺状态改不成就整体回滚，员工刷新重试；绝不出现「审核记录已通过、店铺永远卡在待审」的静默分叉。
     */
    private ShopReview decide(UUID reviewId, UUID staffId, ShopReviewStatus newStatus, String reason) {
        // 1. 校验存在（读这一行只为 404 与 shop_id；「未审」不在这儿判，判在下面的闸门里）
        ShopReview review = Validate.notNull(shopReviewMapper.selectById(reviewId), "审核记录不存在");

        // 2. 写入审批留痕：PENDING → 结论一句条件更新。两个员工同时点同一条待审，后到者 0 行 → 409，
        //    于是「一条记录两条结论、账本里两行处置」在这个窗口里不可能再发生
        OffsetDateTime now = OffsetDateTime.now();
        Validate.conflict(
                shopReviewMapper.decideIfPending(reviewId, newStatus, staffId, reason, now) == 1, "该店铺已审核，请刷新列表");
        // 出参按内存态拼回，不为拼一个返回值再读一次
        review.setStatus(newStatus);
        review.setStaffId(staffId);
        review.setReason(reason);
        review.setDecidedAt(now);

        // 3. 店铺状态对齐：通过 → ACTIVE，拒绝 → REJECTED。改不到即整体回滚（含上一步的留痕）
        Shop shop = Validate.notNull(shopMapper.selectById(review.getShopId()), "店铺不存在");
        ShopStatus target = newStatus == ShopReviewStatus.APPROVED ? ShopStatus.ACTIVE : ShopStatus.REJECTED;
        Validate.conflict(shopMapper.applyReviewVerdict(shop.getId(), target) == 1, "店铺状态已变化，请刷新后重试");
        shop.setStatus(target);

        // 3.5 不可营业 → 同事务播报停业主事件（当前只有驳回会走到这里；判据是「不营业」而不是「被驳回」），
        //     product 监听把该店在架商品级联下架，审核与下架一起成或一起回滚
        if (!shop.isActive()) {
            events.publishEvent(new ShopTradingSuspendedEvent(shop.getId(), "REVIEW_REJECTED"));
        }

        // 4. L3 审计留痕（结构化事件，约定见 docs/conventions/business-event-logging.md）
        BizEvent.of("shop_review.decided")
                .put("review_id", review.getId())
                .put("shop_id", review.getShopId())
                .put("decision", newStatus)
                .put("staff_id", staffId)
                .emit();
        // 5. 审计账本（同一事务，audit :: api）：审核决定是平台治理动作，理由原样入 detail（非敏感自由文本）
        recordAuditCommand.record(
                AuditAction.SHOP_REVIEW_DECIDED,
                review.getId(),
                staffId,
                staffReadQuery.displayNameById(staffId),
                "decision=%s, shop_id=%s, reason=%s"
                        .formatted(newStatus, review.getShopId(), reason == null ? "-" : reason));
        return review;
    }

    // 跨模块只读拼装（经 account 的 api 包，禁止 JOIN）
    /** shopId → 店主手机号：先取 shop.owner_id，再按 account.users.id 查 phone（两步，禁止 JOIN） */
    private Map<UUID, String> loadOwnerPhones(Map<UUID, Shop> shops) {
        if (shops.isEmpty()) return Map.of();
        List<UUID> ownerIds =
                shops.values().stream().map(Shop::getOwnerId).distinct().toList();
        Map<UUID, String> phones = userReadQuery.phonesByIds(ownerIds);

        Map<UUID, String> result = new HashMap<>();
        shops.forEach((shopId, shop) -> result.put(shopId, phones.get(shop.getOwnerId())));
        return result;
    }
}
