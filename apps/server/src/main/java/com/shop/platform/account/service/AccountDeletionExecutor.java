package com.shop.platform.account.service;

import com.shop.platform.account.AccountProperties;
import com.shop.platform.account.mapper.BuyerStore;
import com.shop.platform.infra.security.RefreshTokenStore;
import java.time.OffsetDateTime;
import java.util.Objects;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 注销的执行落点（冷静期满时把「申请」变成「已注销」）。
 *
 * <p>与 {@link AccountDeletionService} 分 bean，是为了让 {@code @Transactional} 真正生效——
 * 同类自调用不过代理，事务边界会静默消失。
 *
 * <p>这里只办账号自己那部分（匿名化 + 地址簿清理 + 会话吊销）。跨模块的联动清理
 * （购物车/收藏/券）等那些模块在重写分支落地后，经 {@code UserDeletedEvent} 的同步监听补进来。
 */
@Service
public class AccountDeletionExecutor {

    private static final Logger log = LoggerFactory.getLogger(AccountDeletionExecutor.class);

    /**
     * 注销后的昵称文案。它不是个人信息（系统生成、全员同一串），留给仍在引用这个 id 的地方
     * （历史订单、评价）一句人能读的说明，而不是空白或占位 uuid。
     */
    static final String DELETED_NICKNAME = "已注销用户";

    private final BuyerStore buyers;
    private final ApplicationEventPublisher events;
    private final RefreshTokenStore refreshTokenStore;
    private final AccountProperties props;

    public AccountDeletionExecutor(
            BuyerStore buyers,
            ApplicationEventPublisher events,
            RefreshTokenStore refreshTokenStore,
            AccountProperties props) {
        this.buyers = Objects.requireNonNull(buyers, "buyers");
        this.events = events;
        this.refreshTokenStore = Objects.requireNonNull(refreshTokenStore, "refreshTokenStore");
        this.props = Objects.requireNonNull(props, "props");
    }

    /**
     * 执行一笔注销，返回是否真的落了地（false = 期内已撤销 / 被禁用中 / 别的批次抢先）。
     *
     * <p>顺序是有意为之：<b>先</b>条件更新拿资格，拿不到就一行都不动。地址清理、会话吊销都排在
     * 资格之后，重复扫描与并发执行因此天然幂等。
     */
    @Transactional
    public boolean execute(UUID buyerId, OffsetDateTime now) {
        // 冷静期口径与 sweep 同源（AccountProperties）：这里再判一遍条件而不是信调用方算好的窗口，
        // 匿名化的资格判定就只有一个地方说了算
        OffsetDateTime cutoff = now.minusDays(props.deletionCoolingOffDays());
        if (!buyers.anonymize(buyerId, reservedPhone(buyerId), DELETED_NICKNAME, cutoff, now)) {
            return false;
        }
        buyers.deleteAddresses(buyerId);
        // 跨模块清理钩子：模块落地后在此发布 UserDeletedEvent（同事务同步监听）
        events.publishEvent(new UserDeleted(buyerId));
        // 会话吊销排在最后：Redis 不在事务里，回滚了也退不回来——宁可多踢一次，不要注销失败却把人留着
        refreshTokenStore.revokeAll(buyerId.toString());
        log.info("[ACCOUNT] 注销已生效, buyerId={}", buyerId);
        return true;
    }

    /**
     * 注销后占住 phone 列的串：列 NOT NULL 且全局唯一，而号码必须交还给电信循环放号后的下一个人
     * （号码回收），所以留不得原值。取 uuid <b>尾</b> 16 位十六进制（uuidv7 的随机段）而不是头部——
     * 头部是毫秒时间戳，一批扫描里同一毫秒注销的两个账号会撞唯一索引。前缀 {@code dz} 让它不再是
     * 任何合法号码形状，登录族按号码查不到这个行；长度 18，列宽容得下。
     */
    private static String reservedPhone(UUID buyerId) {
        return "dz" + buyerId.toString().replace("-", "").substring(16);
    }

    /** 注销生效的模块内事件。跨模块监听者通过它做同事务清理，不用回头 import 本模块的 service。 */
    public record UserDeleted(UUID buyerId) {}
}
