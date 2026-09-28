package com.shop.platform.coupon.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.shop.platform.account.api.StaffReadQuery;
import com.shop.platform.audit.api.AuditAction;
import com.shop.platform.audit.api.RecordAuditCommand;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.PageParams;
import com.shop.platform.common.PageResult;
import com.shop.platform.common.Validate;
import com.shop.platform.coupon.dto.AdminCouponQuery;
import com.shop.platform.coupon.mapper.UserCoupon;
import com.shop.platform.coupon.mapper.UserCouponMapper;
import com.shop.platform.coupon.model.UserCouponStatus;
import com.shop.platform.shop.api.ShopReadQuery;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 券的运营侧动作（admin 域）：目前只有作废（C7）。
 *
 * <p>刻意与买家券包（{@link CouponWalletService}）分开：作废是平台运营/风控的执行入口，
 * 鉴权域（staff）与生命周期语义（越过「用户持有一个可用券」的世界）都不同，不混进买家读模型。
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class CouponAdminService {

    private final UserCouponMapper userCouponMapper;

    private final ShopReadQuery shopReadQuery;
    private final RecordAuditCommand recordAuditCommand;
    private final StaffReadQuery staffReadQuery;

    /** 平台用户券运营列表：只查 coupon schema，店名经 shop::api 批量点查。 */
    @Transactional(readOnly = true)
    public PageResult<AdminCouponItem> pageCoupons(PageParams pageParams, AdminCouponQuery query) {
        // 1. status 在 DTO 形状门先挡 422；service 仍用 enumFilter 守直接调用方。
        UserCouponStatus status = Validate.enumFilter(UserCouponStatus.class, query.status(), "非法的券状态筛选值");
        Page<UserCoupon> rows = userCouponMapper.selectPageForAdmin(pageParams, query.userId(), query.shopId(), status);

        // 2. 店名只按主键批量点查，禁止跨 schema JOIN；缺失店铺名保留为 null，不阻断整页。
        List<UserCoupon> records = rows.getRecords();
        Map<UUID, String> shopNames = shopReadQuery.namesByIds(
                records.stream().map(UserCoupon::getShopId).distinct().toList());

        // 3. 运营行固定拍平金额/状态/来源，避免把 mapper 实体和密码式治理列直接暴露出去。
        return new PageResult<>(
                records.stream()
                        .map(coupon -> new AdminCouponItem(
                                coupon.getId(),
                                coupon.getUserId(),
                                coupon.getShopId(),
                                shopNames.get(coupon.getShopId()),
                                coupon.getTemplateId(),
                                coupon.getName(),
                                coupon.thresholdAsMoney(),
                                coupon.discountAsMoney(),
                                coupon.getType().name(),
                                coupon.maxDiscountAsMoney(),
                                coupon.getBearer(),
                                coupon.getEffectiveAt(),
                                coupon.getExpireAt(),
                                coupon.getStatus(),
                                coupon.getSource(),
                                coupon.getOrderId(),
                                coupon.getCreatedAt()))
                        .toList(),
                rows.getTotal());
    }

    /**
     * 运营作废一张券：UNUSED → VOID，不可逆。
     *
     * <p>只放未使用的券（口径与理由见 {@code UserCouponMapper.voidUnused}）；被占用的券给出「先解绑」
     * 方向的可读 detail，而不是让运营在 409 前猜。条件更新是并发闸门：预读只为把拒绝原因说清楚，
     * 读到与写之间状态被下单/核销抢走时按 409 冲突报「请刷新重试」，不作废半份状态。
     *
     * <p>审计账本（audit :: api）与作废同事务：作废是不可逆的运营动作，「谁废的」必须能事后反查。
     */
    @Transactional
    public void voidCoupon(UUID userCouponId, UUID operatorId) {
        // 1. 券必须存在
        UserCoupon coupon = Validate.notNull(userCouponMapper.selectById(userCouponId), "优惠券不存在");

        // 2. 非 UNUSED 状态逐类给出可理解的拒绝理由（409 是状态冲突，不是参数错误）。
        //    不给 error code：admin 侧只需按 status + detail 文案展示，无分支逻辑要区分
        if (coupon.getStatus() != UserCouponStatus.UNUSED) {
            throw BusinessException.conflict(noVoidableDetail(coupon.getStatus()));
        }

        // 3. 条件作废：并发下状态刚被抢走则 0 行
        Validate.conflict(userCouponMapper.voidUnused(userCouponId, OffsetDateTime.now()) == 1, "该优惠券状态已变化，请刷新后重试");

        // 4. 留痕：作废是运营动作，必须进结构化日志（coupon_usages 的 action 枚举无 VOID 值，
        //    且它记的是金额动作，不为此扩 DB CHECK）
        log.info(
                "[COUPON] 运营作废, userCouponId={}, userId={}, templateId={}",
                userCouponId,
                coupon.getUserId(),
                coupon.getTemplateId());
        // 5. 审计账本（同一事务）：谁作废的哪张券
        recordAuditCommand.record(
                AuditAction.COUPON_USER_COUPON_VOIDED,
                userCouponId,
                operatorId,
                staffReadQuery.displayNameById(operatorId),
                "name=%s, user_id=%s".formatted(coupon.getName(), coupon.getUserId()));
    }

    /** 不可作废原因的对外文案：按当前状态说清「为什么不行」和「要怎么办」 */
    private static String noVoidableDetail(UserCouponStatus status) {
        return switch (status) {
            case LOCKED -> "该优惠券正被一笔未付款订单占用，请先取消该订单再作废";
            case USED -> "该优惠券已核销，无法作废；如需退回请走订单退款";
            case EXPIRED -> "该优惠券已过期，无需作废";
            case VOID -> "该优惠券已作废";
            case UNUSED -> "";
        };
    }
}
