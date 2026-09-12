package com.shop.platform.coupon.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.shop.platform.common.Money;
import com.shop.platform.common.PageParams;
import com.shop.platform.common.PageResult;
import com.shop.platform.common.Validate;
import com.shop.platform.coupon.api.CouponBearer;
import com.shop.platform.coupon.dto.CreateCouponTemplateRequest;
import com.shop.platform.coupon.mapper.CouponTemplate;
import com.shop.platform.coupon.mapper.CouponTemplateMapper;
import com.shop.platform.coupon.model.CouponTemplateStatus;
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
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class CouponTemplateService {

    private final CouponTemplateMapper templateMapper;

    /** 本店券管理列表：按创建时间倒序 */
    @Transactional(readOnly = true)
    public PageResult<CouponTemplate> pageMine(UUID shopId, PageParams page) {
        Page<CouponTemplate> rows = templateMapper.selectPageByShop(new Page<>(page.page(), page.size()), shopId);
        return new PageResult<>(rows.getRecords(), rows.getTotal());
    }

    /**
     * 新建券模板。建好即为 ACTIVE 且可领（有效期起点由卖家给定，未到点则领了也用不了）。
     */
    @Transactional
    public CouponTemplate create(UUID shopId, CreateCouponTemplateRequest req) {
        // 1. 业务条款校验（@Min/@NotNull 只挡住形状，语义条款在这里）
        Validate.isTrue(req.validTo().isAfter(req.validFrom()), "有效期终点必须晚于起点");
        // 「满 100 减 200」这类配置几乎一定是笔误：门槛以内的减免不该超过门槛本身（无门槛券不受此限）
        Validate.isTrue(
                req.thresholdAmount() == 0 || req.discountAmount() <= req.thresholdAmount(), "减免额不能超过使用门槛，请检查是否填反");

        // 2. 落模板：规则的定义。issued_quantity 从 0 起，由领券的条件更新推进
        CouponTemplate template = CouponTemplate.builder()
                .shopId(shopId)
                .name(req.name().trim())
                .thresholdAmount(req.thresholdAmount())
                .discountAmount(req.discountAmount())
                .currency(Money.CNY)
                .bearer(CouponBearer.SELLER)
                .validFrom(req.validFrom())
                .validTo(req.validTo())
                .totalQuantity(req.totalQuantity())
                .issuedQuantity(0)
                .status(CouponTemplateStatus.ACTIVE)
                .build();
        templateMapper.insert(template);
        log.info(
                "[COUPON] 新建券模板, shopId={}, templateId={}, 满{}减{}, 总量={}",
                shopId,
                template.getId(),
                req.thresholdAmount(),
                req.discountAmount(),
                req.totalQuantity());
        return template;
    }

    /**
     * 停用券模板（下架）：只停止继续领取，<b>已领出的券照旧可用</b>——券是快照，
     * 停用不该把买家手上的权益一并作废（要做作废得走单独的作废动作并交代清楚）。
     */
    @Transactional
    public CouponTemplate stop(UUID shopId, UUID templateId) {
        CouponTemplate template = templateMapper.requireShopOwned(shopId, templateId);
        Validate.isTrue(template.getStatus() == CouponTemplateStatus.ACTIVE, 409, "该优惠券已停止发放");
        template.setStatus(CouponTemplateStatus.STOPPED);
        // 停用是幂等的（并发两次停用只是把同一列写成同一个值），不必做成条件更新
        templateMapper.updateById(template);
        log.info("[COUPON] 停用券模板, shopId={}, templateId={}", shopId, templateId);
        return template;
    }
}
