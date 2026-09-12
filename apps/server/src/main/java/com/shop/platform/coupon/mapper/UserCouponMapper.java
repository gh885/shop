package com.shop.platform.coupon.mapper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.shop.platform.common.Validate;
import com.shop.platform.coupon.model.CouponSource;
import com.shop.platform.coupon.model.UserCouponStatus;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface UserCouponMapper extends BaseMapper<UserCoupon> {

    /** 取本人券：券包与所有券动作的同一道门。不属于本人给 404，不泄露券的存在性 */
    default UserCoupon requireOwned(UUID userId, UUID id) {
        UserCoupon coupon = Validate.notNull(selectById(id), "优惠券不存在");
        Validate.isTrue(coupon.getUserId().equals(userId), 404, "优惠券不存在");
        return coupon;
    }

    /**
     * 我的券包分页：status 可选筛选（券包页签），按领取时间倒序。
     *
     * <p>筛选取的是<b>展示状态</b>而非库里的 status：过期以绝对时间为准，收敛任务可能还没刷到，
     * 库里仍是 UNUSED。直接按 status 过滤会让人在「未使用」页签看到早已过期的券。
     * 于是 UNUSED 要额外排掉已过失效时刻的，EXPIRED 要把「已收敛的」与「还没被刷到的」都收进来。
     */
    default Page<UserCoupon> selectPageMine(
            Page<UserCoupon> page, UUID userId, UserCouponStatus status, OffsetDateTime now) {
        LambdaQueryWrapper<UserCoupon> query = new LambdaQueryWrapper<UserCoupon>().eq(UserCoupon::getUserId, userId);
        if (status == UserCouponStatus.UNUSED) {
            query.eq(UserCoupon::getStatus, UserCouponStatus.UNUSED).gt(UserCoupon::getExpireAt, now);
        } else if (status == UserCouponStatus.EXPIRED) {
            query.and(w -> w.eq(UserCoupon::getStatus, UserCouponStatus.EXPIRED)
                    .or(o ->
                            o.eq(UserCoupon::getStatus, UserCouponStatus.UNUSED).le(UserCoupon::getExpireAt, now)));
        } else if (status != null) {
            query.eq(UserCoupon::getStatus, status);
        }
        return selectPage(page, query.orderByDesc(UserCoupon::getCreatedAt));
    }

    /** 我是否已领过该模板的券：领券前的友好判重；真正的闸门是 uk_user_coupons_template_user 唯一索引 */
    default boolean claimedBy(UUID templateId, UUID userId) {
        return selectCount(new LambdaQueryWrapper<UserCoupon>()
                        .eq(UserCoupon::getTemplateId, templateId)
                        .eq(UserCoupon::getUserId, userId)
                        .eq(UserCoupon::getSource, CouponSource.CLAIM))
                > 0;
    }

    /**
     * 结算候选：本店<b>未使用</b>的券。
     * 时间窗、门槛、币种这些「为什么不能用」的判定不在这里 —— 归 evaluator（要给出原因码），
     * 这里只圈出可能用上的那批，避免把已核销/已过期的历史券拉进结算链路。
     */
    default List<UserCoupon> selectUnusedInShop(UUID userId, UUID shopId) {
        return selectList(new LambdaQueryWrapper<UserCoupon>()
                .eq(UserCoupon::getUserId, userId)
                .eq(UserCoupon::getShopId, shopId)
                .eq(UserCoupon::getStatus, UserCouponStatus.UNUSED));
    }

    /**
     * 下单占用：UNUSED → LOCKED。返回 0 = 抢不到（已被别的未付款单占用 / 已核销 / 已被过期任务收敛），
     * 调用方据此回滚整笔下单。
     *
     * <p>这是并发闸门：条件更新 + 影响行数，不做「先读状态再写」。两个并发订单抢同一张券时，
     * 后者在这里拿 0 行，不可能双双用掉同一张券。
     */
    default int lockOne(UUID userCouponId, UUID userId, UUID orderId, long appliedDiscountFen, OffsetDateTime now) {
        return update(
                null,
                new LambdaUpdateWrapper<UserCoupon>()
                        .eq(UserCoupon::getId, userCouponId)
                        .eq(UserCoupon::getUserId, userId)
                        .eq(UserCoupon::getStatus, UserCouponStatus.UNUSED)
                        .set(UserCoupon::getStatus, UserCouponStatus.LOCKED)
                        .set(UserCoupon::getOrderId, orderId)
                        .set(UserCoupon::getLockedAt, now)
                        .set(UserCoupon::getAppliedDiscountAmount, appliedDiscountFen)
                        .set(UserCoupon::getUpdatedAt, now));
    }

    /**
     * 支付成功核销：LOCKED → USED。返回 0 表示本单没有待核销的券（没用券，或已核销过的重放），都不是错误。
     * USED 不可逆：退款不把它改回去，而是补发新券（见 UserCouponStatus）。
     */
    default int useByOrder(UUID orderId, OffsetDateTime now) {
        return update(
                null,
                new LambdaUpdateWrapper<UserCoupon>()
                        .eq(UserCoupon::getOrderId, orderId)
                        .eq(UserCoupon::getStatus, UserCouponStatus.LOCKED)
                        .set(UserCoupon::getStatus, UserCouponStatus.USED)
                        .set(UserCoupon::getUsedAt, now)
                        .set(UserCoupon::getUpdatedAt, now));
    }

    /**
     * 取消 / 超时关单释放：LOCKED → UNUSED，并清掉占用痕迹（order_id/locked_at 归 null，与 CHECK 不变式一致）。
     * 只认 LOCKED —— 已核销的券（USED）走退券补偿，不走释放；已释放过的返回 0，幂等。
     */
    default int releaseByOrder(UUID orderId, OffsetDateTime now) {
        return update(
                null,
                new LambdaUpdateWrapper<UserCoupon>()
                        .eq(UserCoupon::getOrderId, orderId)
                        .eq(UserCoupon::getStatus, UserCouponStatus.LOCKED)
                        .set(UserCoupon::getStatus, UserCouponStatus.UNUSED)
                        .set(UserCoupon::getOrderId, null)
                        .set(UserCoupon::getLockedAt, null)
                        .set(UserCoupon::getAppliedDiscountAmount, null)
                        .set(UserCoupon::getUpdatedAt, now));
    }

    /** 本单占用中的券：释放前先读出来（释放会把 order_id 与实减额清空，事后查不到） */
    default Optional<UserCoupon> selectLockedByOrder(UUID orderId) {
        return Optional.ofNullable(selectOne(new LambdaQueryWrapper<UserCoupon>()
                .eq(UserCoupon::getOrderId, orderId)
                .eq(UserCoupon::getStatus, UserCouponStatus.LOCKED)));
    }

    /** 本单核销掉的券：退款退券据此补发新券；没用券或尚未核销返回 empty */
    default Optional<UserCoupon> selectUsedByOrder(UUID orderId) {
        return Optional.ofNullable(selectOne(new LambdaQueryWrapper<UserCoupon>()
                .eq(UserCoupon::getOrderId, orderId)
                .eq(UserCoupon::getStatus, UserCouponStatus.USED)));
    }

    /**
     * 过期收敛（定时任务）：把已过失效时刻的未使用券刷成 EXPIRED，批量限流避免一次锁太多行。
     *
     * <p>只服务于展示与统计 —— <b>正确性不押在它身上</b>：可用性判定一律读时比 expire_at。
     * 只收敛 UNUSED：LOCKED 的券下单时优惠已定格在订单上，不能因为过期而让已下单的支付失败。
     */
    @Update(
            """
            UPDATE coupon.user_coupons
            SET status = 'EXPIRED', updated_at = #{now}
            WHERE id IN (
                SELECT id FROM coupon.user_coupons
                WHERE status = 'UNUSED' AND expire_at <= #{now}
                LIMIT #{batchSize}
            )
            """)
    int expireDue(@Param("now") OffsetDateTime now, @Param("batchSize") int batchSize);
}
