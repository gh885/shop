package com.shop.platform.coupon.api;

import com.shop.platform.common.Money;
import com.shop.platform.common.Validate;
import com.shop.platform.coupon.mapper.CouponUsage;
import com.shop.platform.coupon.mapper.CouponUsageMapper;
import com.shop.platform.coupon.mapper.UserCoupon;
import com.shop.platform.coupon.mapper.UserCouponMapper;
import com.shop.platform.coupon.model.CouponSource;
import com.shop.platform.coupon.model.CouponUsageAction;
import com.shop.platform.coupon.model.UserCouponStatus;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/**
 * 券命令（跨模块消费）：下单占用、支付核销、取消释放、退款退券。全部在<b>调用方事务内同步执行</b>。
 *
 * <p>四条命令对应券状态机的四条边（见 {@link UserCouponStatus}）：
 * <pre>
 * lock           UNUSED → LOCKED   下单占用（抢不到抛 409 → 整笔下单回滚）
 * useByOrder     LOCKED → USED     支付成功核销
 * releaseByOrder LOCKED → UNUSED   取消 / 超时关单释放
 * returnOnRefund USED    → 补发新券 退款补偿（原券保持 USED，不逆转）
 * </pre>
 *
 * <p>每次都写一条 {@code coupon_usages} 流水（append-only）。流水记的是<b>本单实际减免额</b>（锁定那刻定格，
 * 可能小于面额），不是面额——对账要的是实际减了多少钱。
 *
 * <p>全部幂等安全：重复调用拿 0 行影响，不报错也不产生第二条流水（唯一的例外是 lock，它抢不到就该失败）。
 */
@Component
@Slf4j
@RequiredArgsConstructor
public class CouponCommand {

    private final UserCouponMapper userCouponMapper;

    private final CouponUsageMapper usageMapper;

    /**
     * 下单占用：UNUSED → LOCKED，并定格本单实际减免额。order 在落单事务内调用。
     *
     * <p>并发闸门在条件更新里：两个订单同时抢同一张券，后者影响行数 0 → 抛 409 → 整笔下单回滚，
     * 不可能双双用掉同一张券。不锁的话，同一张券能被多笔未付款订单同时占着（coupon.md §4）。
     *
     * @param appliedDiscount 本单实际减免额（order 已据此落了订单金额，券侧不再重算）
     */
    public void lock(UUID userCouponId, UUID userId, UUID orderId, Money appliedDiscount) {
        // 1. 归属与面额护栏：不属于本人给 404（不泄露券存在性）；实减超过面额说明调用方算错了，当场拦下
        UserCoupon coupon = userCouponMapper.requireOwned(userId, userCouponId);
        Validate.isTrue(appliedDiscount.amount() <= coupon.getDiscountAmount(), "优惠金额超过券面额");
        Validate.isTrue(appliedDiscount.currency().equals(coupon.getCurrency()), "优惠币种与券不一致");

        // 2. 条件占用：这是并发闸门，不做「先读状态再写」
        int affected =
                userCouponMapper.lockOne(userCouponId, userId, orderId, appliedDiscount.amount(), OffsetDateTime.now());
        Validate.conflict(affected == 1, "该优惠券已被其他订单占用或已失效，请重新选择");

        // 3. 记账
        record(coupon, orderId, CouponUsageAction.LOCK, appliedDiscount);
    }

    /**
     * 支付成功核销：LOCKED → USED。本单没用券、或已核销过的重放，都是无副作用返回。
     *
     * <p>USED 不可逆：退款不把它改回 UNUSED，而是补发新券（见 {@link #returnOnRefund}）——否则核销流水断链。
     */
    public void useByOrder(UUID orderId) {
        if (userCouponMapper.useByOrder(orderId, OffsetDateTime.now()) == 1) {
            userCouponMapper
                    .selectUsedByOrder(orderId)
                    .ifPresent(
                            coupon -> record(coupon, orderId, CouponUsageAction.USE, coupon.appliedDiscountAsMoney()));
        }
    }

    /**
     * 取消 / 超时关单释放：LOCKED → UNUSED，券回到买家手上。
     *
     * <p>只认 LOCKED：已核销的券（USED，即付款后取消）不走这里，走 {@link #returnOnRefund} 的补偿——
     * 释放（原券可再用）与补偿（另发新券）是两件事，混在一起会让「用过几次」算不清。
     */
    public void releaseByOrder(UUID orderId) {
        userCouponMapper.selectLockedByOrder(orderId).ifPresent(coupon -> {
            if (userCouponMapper.releaseByOrder(orderId, OffsetDateTime.now()) == 1) {
                record(coupon, orderId, CouponUsageAction.RELEASE, coupon.appliedDiscountAsMoney());
            }
        });
    }

    /**
     * 退款退券：给买家补发一张同规则的新券（{@code source = REFUND_RETURN}），原券保持 USED。
     *
     * <p>已付款取消、待发货超时取消、售后退款完成都走这里（都是整单退款）。
     * 三条定案（coupon.md §7）：
     * <ul>
     *   <li><b>已过期不退</b>：券是限时权益不是资产。新券窗口 = [now, 原失效时刻]，不延长原有效期。
     *   <li><b>发新券而不是把 USED 改回 UNUSED</b>：核销流水保持完整，也算得清被用了几次。
     *   <li><b>不占发放名额、不恢复每人限领额度</b>：这是履约补偿不是营销发放，且防止被反复薅。
     * </ul>
     */
    public void returnOnRefund(UUID orderId) {
        userCouponMapper.selectUsedByOrder(orderId).ifPresent(original -> {
            OffsetDateTime now = OffsetDateTime.now();
            if (original.expiredAt(now)) {
                log.info("[COUPON] 退款退券跳过: 券已过期, orderId={}, userCouponId={}", orderId, original.getId());
                return;
            }
            // 规则整份快照复制：退的是同一张券的权益，不是重新发放（模板可能已被改/被停）
            userCouponMapper.insert(UserCoupon.builder()
                    .templateId(original.getTemplateId())
                    .userId(original.getUserId())
                    .shopId(original.getShopId())
                    .name(original.getName())
                    .thresholdAmount(original.getThresholdAmount())
                    .discountAmount(original.getDiscountAmount())
                    .currency(original.getCurrency())
                    .bearer(original.getBearer())
                    .effectiveAt(now)
                    .expireAt(original.getExpireAt())
                    .status(UserCouponStatus.UNUSED)
                    .source(CouponSource.REFUND_RETURN)
                    .build());
            record(original, orderId, CouponUsageAction.RETURN, original.appliedDiscountAsMoney());
            log.info("[COUPON] 退款退券, orderId={}, 原券={}", orderId, original.getId());
        });
    }

    /** 流水统一写入口：金额与归属全部取券行，调用方只给动作 */
    private void record(UserCoupon coupon, UUID orderId, CouponUsageAction action, Money amount) {
        usageMapper.insert(CouponUsage.builder()
                .userCouponId(coupon.getId())
                .orderId(orderId)
                .userId(coupon.getUserId())
                .shopId(coupon.getShopId())
                .action(action)
                .discountAmount(amount.amount())
                .currency(amount.currency())
                .build());
    }
}
