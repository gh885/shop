package com.shop.platform.coupon.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.shop.platform.common.PageParams;
import com.shop.platform.common.PageResult;
import com.shop.platform.common.Validate;
import com.shop.platform.coupon.api.CouponBearer;
import com.shop.platform.coupon.dto.CreateCouponTemplateRequest;
import com.shop.platform.coupon.mapper.CouponTemplate;
import com.shop.platform.coupon.mapper.CouponTemplateMapper;
import com.shop.platform.coupon.mapper.UserCouponMapper;
import com.shop.platform.coupon.model.CouponTemplateStatus;
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
        Page<CouponTemplate> rows = templateMapper.selectPageByShop(new Page<>(page.page(), page.size()), shopId);
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
     * 新建券模板。建好即为 ACTIVE 且可领（有效期起点由卖家给定，未到点则领了也用不了）。
     *
     * <p>回执的已核销数恒为 0：刚建的券不可能被核销过，不必为它多查一次库。
     */
    @Transactional
    public ShopCoupon create(UUID shopId, CreateCouponTemplateRequest req) {
        // 1. 业务条款校验（@NotNull 只挡住形状，语义条款在这里）
        Validate.isTrue(req.validTo().isAfter(req.validFrom()), "有效期终点必须晚于起点");
        Validate.isTrue(req.discountAmount().amount() > 0, "减免额必须大于 0");
        // 「满 100 减 200」这类配置几乎一定是笔误：门槛以内的减免不该超过门槛本身（无门槛券不受此限）
        Validate.isTrue(
                req.thresholdAmount().amount() == 0 || req.thresholdAmount().atLeast(req.discountAmount()),
                "减免额不能超过使用门槛，请检查是否填反");

        // 2. 落模板：规则的定义。issued_quantity 从 0 起，由领券的条件更新推进
        //    两个金额必同币种（入参已按平台币种收口），模板一份币种列即代表这两个金额
        CouponTemplate template = CouponTemplate.builder()
                .shopId(shopId)
                .name(req.name().trim())
                .thresholdAmount(req.thresholdAmount().amount())
                .discountAmount(req.discountAmount().amount())
                .currency(req.discountAmount().currency())
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
                req.thresholdAmount().amount(),
                req.discountAmount().amount(),
                req.totalQuantity());
        return new ShopCoupon(template, 0);
    }

    /**
     * 停用券模板（下架）：只停止继续领取，<b>已领出的券照旧可用</b>——券是快照，
     * 停用不该把买家手上的权益一并作废（要做作废得走单独的作废动作并交代清楚）。
     */
    @Transactional
    public ShopCoupon stop(UUID shopId, UUID templateId) {
        CouponTemplate template = templateMapper.requireShopOwned(shopId, templateId);
        Validate.isTrue(template.getStatus() == CouponTemplateStatus.ACTIVE, 409, "该优惠券已停止发放");
        template.setStatus(CouponTemplateStatus.STOPPED);
        // 停用是幂等的（并发两次停用只是把同一列写成同一个值），不必做成条件更新
        templateMapper.updateById(template);
        log.info("[COUPON] 停用券模板, shopId={}, templateId={}", shopId, templateId);
        // 停完要能接着看到这张券的成绩，所以回执照旧带已核销数（前端就地更新那一行，不用整页刷新）
        long used = userCouponMapper.countUsedByTemplateIds(List.of(templateId)).getOrDefault(templateId, 0L);
        return new ShopCoupon(template, used);
    }
}
