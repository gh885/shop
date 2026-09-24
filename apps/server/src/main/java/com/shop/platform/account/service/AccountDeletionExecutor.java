package com.shop.platform.account.service;

import com.shop.platform.account.events.UserDeletedEvent;
import com.shop.platform.account.mapper.AddressMapper;
import com.shop.platform.account.mapper.UserMapper;
import com.shop.platform.account.model.AccountDeletionTimeouts;
import com.shop.platform.infra.observability.BizEvent;
import com.shop.platform.infra.security.RefreshTokenStore;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 注销的执行落点（冷静期满或由扫描器触发时把「申请」变成「已注销」）。
 *
 * <p>与 {@link AccountDeletionService} 分 bean，是为了让 {@code @Transactional} 真正生效——
 * 同类自调用不过代理，事务边界会静默消失（与 {@code OrderTimeoutService} 逐笔落地的写法同一个理由）。
 *
 * <p>这里只办账号自己那部分（匿名化 + 地址软删 + 会话吊销），购物车/收藏/券/店铺成员四处的清理
 * 由 {@link UserDeletedEvent} 的同步监听在<b>同一个事务</b>内完成：任一处失败即整体回滚，
 * 不会出现「号已注销、购物车还挂在那个手机号上」这种半截状态。
 */
@Service
@RequiredArgsConstructor
public class AccountDeletionExecutor {

    /**
     * 注销后的昵称文案。它不是个人信息（系统生成、全员同一串），留给仍在引用这个 id 的地方
     * （管理端用户列表、卖家侧成员列表）一句人能读的说明，而不是空白或占位 uuid。
     */
    static final String DELETED_NICKNAME = "已注销用户";

    private final UserMapper userMapper;
    private final AddressMapper addressMapper;
    private final ApplicationEventPublisher events;
    private final RefreshTokenStore refreshTokenStore;

    /**
     * 执行一笔注销，返回是否真的落了地（false = 期内已撤销 / 被平台禁用 / 别的批次抢先）。
     *
     * <p>顺序是有意为之：<b>先</b>条件更新拿资格，拿不到就一行都不动。地址与四模块的清理、会话吊销
     * 都排在资格之后，重复扫描与并发执行因此天然幂等。
     */
    @Transactional
    public boolean execute(UUID userId, OffsetDateTime now) {
        OffsetDateTime cutoff = now.minus(AccountDeletionTimeouts.COOLING_OFF);
        if (userMapper.anonymize(userId, reservedPhone(userId), DELETED_NICKNAME, cutoff, now) == 0) {
            return false;
        }
        int addresses = addressMapper.softDeleteByUser(userId);
        // 同步监听：cart / favorite / coupon / shop 在本事务内清各自的数据，任一失败整体回滚
        events.publishEvent(new UserDeletedEvent(userId));
        // 会话吊销排在最后：Redis 不在事务里，回滚了也退不回来——宁可多踢一次，不要注销失败却把人留着
        refreshTokenStore.revokeAll(userId.toString());

        BizEvent.of("user.deleted")
                .put("user_id", userId)
                .put("address_count", addresses)
                .emit();
        return true;
    }

    /**
     * 注销后占住 phone 列的串：列是 NOT NULL 且有全局唯一索引，而号码必须交还给电信循环放号后的下一个人
     * （ACC-77），所以留不得原值。
     *
     * <p>取 uuid <b>尾</b> 16 位十六进制（uuidv7 的随机段，约 62 位熵）而不是头部——头部是毫秒时间戳，
     * 一批扫描里同一毫秒注销的两个账号会撞唯一索引。前缀 {@code dz} 让它不再是任何合法号码形状，
     * 登录族按号码查不到这个行；长度 18，列宽 20。
     */
    private static String reservedPhone(UUID userId) {
        return "dz" + userId.toString().replace("-", "").substring(16);
    }
}
