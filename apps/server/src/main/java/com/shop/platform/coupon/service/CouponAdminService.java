package com.shop.platform.coupon.service;

import com.shop.platform.common.BusinessException;
import com.shop.platform.common.Validate;
import com.shop.platform.coupon.mapper.UserCoupon;
import com.shop.platform.coupon.mapper.UserCouponMapper;
import com.shop.platform.coupon.model.UserCouponStatus;
import java.time.OffsetDateTime;
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

    /**
     * 运营作废一张券：UNUSED → VOID，不可逆。
     *
     * <p>只放未使用的券（口径与理由见 {@code UserCouponMapper.voidUnused}）；被占用的券给出「先解绑」
     * 方向的可读 detail，而不是让运营在 409 前猜。条件更新是并发闸门：预读只为把拒绝原因说清楚，
     * 读到与写之间状态被下单/核销抢走时按 409 冲突报「请刷新重试」，不作废半份状态。
     */
    @Transactional
    public void voidCoupon(UUID userCouponId) {
        // 1. 券必须存在
        UserCoupon coupon = Validate.notNull(userCouponMapper.selectById(userCouponId), "优惠券不存在");

        // 2. 非 UNUSED 状态逐类给出可理解的拒绝理由（409 是状态冲突，不是参数错误）。
        //    不给 error code：admin 侧只需按 status + detail 文案展示，无分支逻辑要区分
        if (coupon.getStatus() != UserCouponStatus.UNUSED) {
            throw new BusinessException(409, noVoidableDetail(coupon.getStatus()));
        }

        // 3. 条件作废：并发下状态刚被抢走则 0 行
        Validate.isTrue(userCouponMapper.voidUnused(userCouponId, OffsetDateTime.now()) == 1, 409, "该优惠券状态已变化，请刷新后重试");

        // 4. 留痕：作废是运营动作，必须进结构化日志（coupon_usages 的 action 枚举无 VOID 值，
        //    且它记的是金额动作，不为此扩 DB CHECK）
        log.info(
                "[COUPON] 运营作废, userCouponId={}, userId={}, templateId={}",
                userCouponId,
                coupon.getUserId(),
                coupon.getTemplateId());
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
