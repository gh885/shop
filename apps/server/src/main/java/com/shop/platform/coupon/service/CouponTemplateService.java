package com.shop.platform.coupon.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.shop.platform.common.Money;
import com.shop.platform.common.PageParams;
import com.shop.platform.common.PageResult;
import com.shop.platform.common.Validate;
import com.shop.platform.coupon.api.CouponBearer;
import com.shop.platform.coupon.dto.CouponFieldRules;
import com.shop.platform.coupon.dto.CreateCouponTemplateRequest;
import com.shop.platform.coupon.mapper.CouponTemplate;
import com.shop.platform.coupon.mapper.CouponTemplateMapper;
import com.shop.platform.coupon.mapper.UserCouponMapper;
import com.shop.platform.coupon.model.CouponTemplateStatus;
import com.shop.platform.coupon.model.CouponType;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 卖家侧券管理：建券、看券、停券。买家的领取与使用在 {@link CouponClaimService} / CouponCommand。
 *
 * <p>建券只写模板，不发给任何人——发放是买家领取时的事（CouponClaimService）。
 * 「建了就等于发出去了」是常见误解，这里靠总量与已发放数两个字段把两者分开。
 *
 * <p>列表额外带<b>已核销数</b>（{@link ShopCoupon}）：只看「发了多少」看不出券有没有变成订单，
 * 卖家没法据此判断这张券值不值得续投。
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class CouponTemplateService {

    private final CouponTemplateMapper templateMapper;

    private final UserCouponMapper userCouponMapper;

    /** 本店券管理列表：按创建时间倒序，带已核销数 */
    @Transactional(readOnly = true)
    public PageResult<ShopCoupon> pageMine(UUID shopId, PageParams page) {
        Page<CouponTemplate> rows = templateMapper.selectPageByShop(page, shopId);
        List<CouponTemplate> records = rows.getRecords();
        Map<UUID, Long> usedCounts = userCouponMapper.countUsedByTemplateIds(
                records.stream().map(CouponTemplate::getId).toList());
        return new PageResult<>(
                records.stream()
                        .map(t -> new ShopCoupon(t, usedCounts.getOrDefault(t.getId(), 0L)))
                        .toList(),
                rows.getTotal());
    }

    /**
     * 新建券模板。建好即为 ACTIVE 且可领（发放窗口起点由卖家给定，未到点则领了也用不了）。
     *
     * <p>两型券的字段互斥在这里收口（CPN-65）：折扣券必给折率与封顶、满减券必给面额，
     * 不给另一半的一律 400——库上还有 CHECK 兜底，但库报错是 500。
     *
     * <p>回执的已核销数恒为 0：刚建的券不可能被核销过，不必为它多查一次库。
     */
    @Transactional
    public ShopCoupon create(UUID shopId, CreateCouponTemplateRequest req) {
        // 1. 通用条款：发放窗口方向（valid_days 是「领到之后能用多久」，不参与这条比较）
        Validate.isTrue(req.validTo().isAfter(req.validFrom()), "有效期终点必须晚于起点");

        // 2. 券型条款：满减给面额、折扣给折率 + 封顶，两列互斥（CPN-65）
        CouponType type = req.type() == null ? CouponType.FULL_REDUCTION : req.type();
        Long discountAmount = type == CouponType.FULL_REDUCTION ? requireFaceAmount(req.discountAmount()) : null;
        BigDecimal discountRate = null;
        Long maxDiscount = null;
        if (type == CouponType.DISCOUNT) {
            // 折率必须落在 (0,1)：1.00 不构成折扣，0 必亏
            BigDecimal rate = Validate.notNull(req.discountRate(), "折扣券必须填写折扣率");
            Validate.isTrue(
                    rate.compareTo(BigDecimal.ZERO) > 0 && rate.compareTo(BigDecimal.ONE) < 0,
                    CouponFieldRules.DISCOUNT_RATE_MAX_MESSAGE);
            // 封顶必填（CPN-65）：没封顶的折扣券在大单上会亏穿
            Money cap = Validate.notNull(req.maxDiscountAmount(), "折扣券必须填写最高减免金额");
            Validate.isTrue(cap.amount() > 0, "最高减免金额必须大于 0");
            discountRate = rate;
            maxDiscount = cap.amount();
        }

        // 3. 门槛条款：「满 100 减 200」这类配置几乎一定是笔误（门槛以内的减免不该超过门槛本身；无门槛券不受此限）。
        //    比的是两个「分」值而不是两个 Money：这一步还没落库，没有那一行的 currency 列可借
        Validate.isTrue(
                req.thresholdAmount().amount() == 0
                        || discountAmount == null
                        || req.thresholdAmount().amount() >= discountAmount,
                "减免额不能超过使用门槛，请检查是否填反");

        // 4. 落模板：规则的定义。issued_quantity 从 0 起，由领券的条件更新推进；一份币种列即代表这几个金额
        CouponTemplate template = CouponTemplate.builder()
                .shopId(shopId)
                .name(req.name().trim())
                .type(type)
                .thresholdAmount(req.thresholdAmount().amount())
                .discountAmount(discountAmount)
                .currency(req.thresholdAmount().currency())
                .discountRate(discountRate)
                .maxDiscountAmount(maxDiscount)
                .bearer(CouponBearer.SELLER)
                .validFrom(req.validFrom())
                .validTo(req.validTo())
                .validDays(req.validDays())
                .totalQuantity(req.totalQuantity())
                .issuedQuantity(0)
                .status(CouponTemplateStatus.ACTIVE)
                .build();
        templateMapper.insert(template);
        log.info(
                "[COUPON] 新建券模板, shopId={}, templateId={}, type={}, 门槛={}, 总量={}",
                shopId,
                template.getId(),
                type,
                req.thresholdAmount().amount(),
                req.totalQuantity());
        return new ShopCoupon(template, 0);
    }

    /**
     * 满减券的面额：必填且 > 0。
     *
     * <p>折扣券不走这里（它的面值由折率与封顶表达，{@code discount_amount} 落 null，见 CPN-65）。
     */
    private static Long requireFaceAmount(Money discountAmount) {
        Money face = Validate.notNull(discountAmount, "满减券必须填写减免额");
        Validate.isTrue(face.amount() > 0, "减免额必须大于 0");
        return face.amount();
    }

    /**
     * 停用券模板（下架）：只停止继续领取，<b>已领出的券照旧可用</b>——券是快照，
     * 停用不该把买家手上的权益一并作废（要做作废得走单独的作废动作并交代清楚）。
     */
    @Transactional
    public ShopCoupon stop(UUID shopId, UUID templateId) {
        CouponTemplate template = templateMapper.requireShopOwned(shopId, templateId);
        Validate.conflict(template.getStatus() == CouponTemplateStatus.ACTIVE, "该优惠券已停止发放");
        template.setStatus(CouponTemplateStatus.STOPPED);
        // 停用是幂等的（并发两次停用只是把同一列写成同一个值），不必做成条件更新
        templateMapper.updateById(template);
        log.info("[COUPON] 停用券模板, shopId={}, templateId={}", shopId, templateId);
        // 停完要能接着看到这张券的成绩，所以回执照旧带已核销数（前端就地更新那一行，不用整页刷新）
        long used = userCouponMapper.countUsedByTemplateIds(List.of(templateId)).getOrDefault(templateId, 0L);
        return new ShopCoupon(template, used);
    }
}
