package com.shop.platform.account.service;

import com.shop.platform.account.AccountProperties;
import com.shop.platform.account.mapper.BuyerStore;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.ErrorCodes;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * 买家自助注销（个保法第 47 条）：申请、撤销、查状态，以及给定时扫描器派活。
 *
 * <p>两段式而不是点一下就删：申请只落一个时刻，冷静期内账号一切照常、可无限次撤销；
 * 期满才由 {@link AccountDeletionExecutor} 匿名化。
 *
 * <p>本类不做任何跨模块清理——重写期的账号还没有需要联动清理的跨模块数据
 * （购物车等模块尚未实现），地址簿与订单快照本来就与账号行无引用关系。
 */
@Service
public class AccountDeletionService {

    private static final Logger log = LoggerFactory.getLogger(AccountDeletionService.class);

    /** 每轮扫描至多执行多少笔：注销是毁灭性动作，宁可分批慢做，也不要一轮锁住大批账号行 */
    private static final int BATCH_LIMIT = 20;

    private final BuyerStore buyers;
    private final SmsCodeService smsCodeService;
    private final AccountDeletionExecutor executor;
    private final AccountProperties props;

    public AccountDeletionService(
            BuyerStore buyers,
            SmsCodeService smsCodeService,
            AccountDeletionExecutor executor,
            AccountProperties props) {
        this.buyers = Objects.requireNonNull(buyers, "buyers");
        this.smsCodeService = Objects.requireNonNull(smsCodeService, "smsCodeService");
        this.executor = Objects.requireNonNull(executor, "executor");
        this.props = Objects.requireNonNull(props, "props");
    }

    /**
     * 注销状态（给账号安全页看的一句话）：有没有待生效的申请，以及哪一刻生效。
     *
     * @param coolingOffDays 冷静期天数随状态一起下发，前端提示不再各自写死数字
     */
    public record DeletionState(boolean requested, OffsetDateTime effectiveAt, long coolingOffDays) {}

    public DeletionState status(UUID buyerId) {
        BuyerStore.BuyerRow user = requireActive(buyerId);
        OffsetDateTime requested = user.deletionRequestedAt();
        return new DeletionState(
                requested != null,
                requested == null ? null : requested.plus(coolingOff()),
                coolingOff().toDays());
    }

    /** 发注销验证码到本人绑定手机号（号码取 token 背后的账号，不让前端自报，故无需图形验证码） */
    public void sendCode(UUID buyerId, String clientIp) {
        BuyerStore.BuyerRow user = requireActive(buyerId);
        if (user.deletionRequestedAt() != null) {
            throw BusinessException.conflict("已提交注销申请，可在账号安全页撤销");
        }
        smsCodeService.sendDeletionCode(user.phone(), clientIp);
    }

    /**
     * 提交注销申请：先消费一次性验证码，再落申请时刻。
     * 校验码在前、写库在后：写库失败（并发/已申请）浪费一枚码，反过来则等于「没过验证就能注销」。
     */
    public void request(UUID buyerId, String code) {
        BuyerStore.BuyerRow user = requireActive(buyerId);
        smsCodeService.verifyDeletionCode(user.phone(), code);
        OffsetDateTime now = OffsetDateTime.now();
        if (!buyers.markDeletionRequested(buyerId, now)) {
            throw BusinessException.conflict("账号状态已变化或已有待生效的注销申请，请刷新后重试");
        }
        log.info("[ACCOUNT] 注销申请已提交, buyerId={}, 生效于={}", buyerId, now.plus(coolingOff()));
    }

    /** 撤销注销申请（冷静期内）：清空申请时刻，账号回到申请前的完全同一状态 */
    public void cancel(UUID buyerId) {
        if (!buyers.cancelDeletion(buyerId)) {
            throw BusinessException.conflict("没有待生效的注销申请");
        }
        log.info("[ACCOUNT] 注销申请已撤销, buyerId={}", buyerId);
    }

    /**
     * 扫描并执行到期的注销申请（定时任务入口），返回本轮真正落地笔数。
     *
     * <p>逐笔独立事务（在 {@link AccountDeletionExecutor} 上），一笔失败不牵连其余；查询按申请时刻取
     * 头部一批，没有隔离时第 3 笔抛异常会让第 4 笔起每轮都排在它后面而永远执行不到。
     * 无分布式锁——资格判定全在 anonymize 的条件更新里，多实例并发扫描同一行只有一个赢。
     */
    public int sweep() {
        OffsetDateTime now = OffsetDateTime.now();
        List<UUID> due = buyers.selectDeletionDue(now.minus(coolingOff()));
        int done = 0;
        for (UUID buyerId : due) {
            if (done >= BATCH_LIMIT) {
                break;
            }
            try {
                if (executor.execute(buyerId, now)) {
                    done++;
                }
            } catch (RuntimeException e) {
                // 逐笔隔离：这一笔的失败留到下一轮重试，不中断同批其余的注销
                log.error("[ACCOUNT] 注销执行失败, buyerId={}", buyerId, e);
            }
        }
        return done;
    }

    private Duration coolingOff() {
        return Duration.ofDays(props.deletionCoolingOffDays());
    }

    /**
     * 账号必须存在且正常。两件事分开拒：
     * 已注销 → 与「从未存在」同一答案（404）；被禁用 → 不给自助注销（403）：
     * 封号是平台在追的事，注销不该成为「把追踪线索自我销毁」的出口，要注销先由平台解禁。
     */
    private BuyerStore.BuyerRow requireActive(UUID buyerId) {
        BuyerStore.BuyerRow user = buyers.find(buyerId).orElseThrow(() -> BusinessException.notFound("用户不存在"));
        if (user.deletedAt() != null) {
            throw BusinessException.notFound("用户不存在");
        }
        if (!"active".equals(user.status())) {
            throw BusinessException.forbidden(ErrorCodes.USER_DISABLED, "账号已被禁用，请联系平台客服");
        }
        return user;
    }
}
