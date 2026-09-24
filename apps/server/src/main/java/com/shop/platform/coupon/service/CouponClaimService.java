package com.shop.platform.coupon.service;

import com.shop.platform.common.BusinessException;
import com.shop.platform.common.ErrorCodes;
import com.shop.platform.common.Validate;
import com.shop.platform.coupon.mapper.CouponTemplate;
import com.shop.platform.coupon.mapper.CouponTemplateMapper;
import com.shop.platform.coupon.mapper.UserCoupon;
import com.shop.platform.coupon.mapper.UserCouponMapper;
import com.shop.platform.coupon.model.CouponSource;
import com.shop.platform.coupon.model.CouponTemplateStatus;
import com.shop.platform.coupon.model.UserCouponStatus;
import com.shop.platform.shop.api.ShopReadQuery;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 领券 —— 把模板变成买家手上的一张券（规则快照复制）。
 *
 * <p>两道并发闸门，都不靠应用层判重：
 * <ul>
 *   <li><b>总量</b>：条件更新把 issued_quantity +1（WHERE issued &lt; total），拿不到即已领完。
 *   <li><b>每人限领 1 张</b>：uk_user_coupons_template_user 唯一索引兜底（部分索引，只约束 CLAIM）。
 * </ul>
 * 顺序是「先扣名额、再插券」：插券撞唯一索引会让整个事务回滚，名额扣减随之回滚，不会白占一个名额。
 * 事务内 catch 唯一键冲突后不再做任何数据库操作（PG 撞索引即把事务标记为 aborted），只抛业务异常让事务回滚。
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class CouponClaimService {

    private final CouponTemplateMapper templateMapper;

    private final UserCouponMapper userCouponMapper;

    /** 券包行要带店名：与券包列表同一套拼装口径（shop :: api 点查，跨 schema 不 JOIN） */
    private final ShopReadQuery shopReadQuery;

    /**
     * 本店可展示的「领券列表」（店铺领券页，匿名可访问）：ACTIVE 且未过发放期的券，按创建时间倒序。
     * 领完的（前端置灰「已领完」）与未到起点的（「x 点开抢」，C9）都在列表里——露出不是放行的承诺，
     * 真正能不能领由领券端点按时间窗/名额闸住（issueOne 的条件更新仍要求 now ∈ [validFrom, validTo)）。
     */
    @Transactional(readOnly = true)
    public List<CouponTemplate> claimable(UUID shopId) {
        return templateMapper.selectClaimable(shopId, OffsetDateTime.now());
    }

    /**
     * 领券。
     *
     * <p>策略：发出去的券价值 = 领取那一刻的模板规则（快照），此后模板被改被停都与它无关。
     *
     * <p>返回券包行形状（{@link MyCoupon}）而不是实体：调用方要的是「用户看到的这张券」，
     * 店名与展示状态都在这里一次取好，不让 controller 去拼装领域细节。
     */
    @Transactional
    public MyCoupon claim(UUID userId, UUID templateId) {
        OffsetDateTime now = OffsetDateTime.now();

        // 1. 模板必须存在、在发、在有效期内 —— 给出可理解的 400，而不是笼统的冲突
        CouponTemplate template = Validate.notNull(templateMapper.selectById(templateId), "优惠券不存在");
        Validate.isTrue(template.getStatus() == CouponTemplateStatus.ACTIVE, "该优惠券已停止发放");
        // 起止分开报：还没开始和已经结束，对用户是两件事（前者可以等等，后者没救了）
        Validate.isTrue(!now.isBefore(template.getValidFrom()), "该优惠券尚未开始发放");
        Validate.isTrue(now.isBefore(template.getValidTo()), "该优惠券已结束发放");

        // 2. 友好判重（真正的闸门是第 4 步的唯一索引）：已领过就直接说清楚，不做无谓的名额扣减。
        //    必须带上与撞键路径同一个 code —— 两条路径是同一个业务情形，出参不能时有时无
        //    （Validate.isTrue 的带 code 重载是 400，这里要的是 409，故显式抛）
        if (userCouponMapper.claimedBy(templateId, userId)) {
            throw BusinessException.conflict(ErrorCodes.COUPON_ALREADY_CLAIMED, "您已领取过该优惠券");
        }

        // 3. 名额条件扣减：并发超发被这一条语句闸住
        Validate.isTrue(templateMapper.issueOne(templateId, now) == 1, 409, "该优惠券已被领完");

        // 4. 发券：规则整份快照（金额/门槛/有效期折算成绝对值），读券从此不碰模板
        UserCoupon coupon = UserCoupon.builder()
                .templateId(template.getId())
                .userId(userId)
                .shopId(template.getShopId())
                .name(template.getName())
                .thresholdAmount(template.getThresholdAmount())
                .discountAmount(template.getDiscountAmount())
                .currency(template.getCurrency())
                .bearer(template.getBearer())
                .effectiveAt(template.getValidFrom())
                .expireAt(template.getValidTo())
                .status(UserCouponStatus.UNUSED)
                .source(CouponSource.CLAIM)
                .build();
        try {
            userCouponMapper.insert(coupon);
        } catch (DuplicateKeyException e) {
            // 并发重复领取：唯一索引兜住。此处不可再做任何查库（事务已被 PG 标记 aborted），只抛异常回滚
            throw BusinessException.conflict(ErrorCodes.COUPON_ALREADY_CLAIMED, "您已领取过该优惠券");
        }
        log.info("[COUPON] 领券成功, userId={}, templateId={}, userCouponId={}", userId, templateId, coupon.getId());
        String shopName = shopReadQuery.namesByIds(List.of(coupon.getShopId())).get(coupon.getShopId());
        return MyCoupon.of(coupon, shopName, now);
    }
}
