package com.shop.platform.coupon.service;

import com.shop.platform.account.events.UserDeletedEvent;
import com.shop.platform.coupon.mapper.UserCouponMapper;
import java.time.OffsetDateTime;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * 账号注销 → 作废该用户名下的未使用券：监听 account 的 UserDeletedEvent，在注销生效的同一事务内落地。
 *
 * <p>不物理删行：核销流水（coupon_usages）与「这张券曾经发给谁」的发放统计要靠这行对账，
 * VOID 是券自己的终态（运营作废走的是同一个态），既不留下可用的个人数据，也不把账断掉。
 * 只收 UNUSED 的理由见 {@code UserCouponMapper.voidAllUnused}。
 */
@Component
@Slf4j
@RequiredArgsConstructor
public class CouponAccountDeletionListener {

    private final UserCouponMapper userCouponMapper;

    @EventListener
    public void onUserDeleted(UserDeletedEvent event) {
        int voided = userCouponMapper.voidAllUnused(event.userId(), OffsetDateTime.now());
        if (voided > 0) {
            log.info("[COUPON] 账号注销作废未使用券, userId={}, 作废张数={}", event.userId(), voided);
        }
    }
}
