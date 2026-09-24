package com.shop.platform.account.service;

import com.shop.platform.account.mapper.User;
import com.shop.platform.account.mapper.UserMapper;
import com.shop.platform.account.model.AccountDeletionTimeouts;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.Validate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

/**
 * 买家自助注销（个保法第 47 条）：申请、撤销、查状态，以及给定时扫描器派活。
 *
 * <p>两段式而不是点一下就删：申请只落一个时刻（{@code deletion_requested_at}），15 天冷静期内
 * 账号一切照常、可无限次撤销；期满才由 {@link AccountDeletionExecutor} 匿名化。
 * 理由见 {@link AccountDeletionTimeouts#COOLING_OFF}。
 *
 * <p>本类不做任何跨模块清理，也不读别的模块的状态——注销要动的东西散在四个模块，
 * 而账号能读到的只有自己（详见 {@code account/events} 的包注释：反向依赖会成环）。
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class AccountDeletionService {

    /** 每轮扫描至多执行多少笔：注销是毁灭性动作，宁可分批慢做，也不要一轮锁住大批账号行 */
    private static final int BATCH_LIMIT = 20;

    private final UserMapper userMapper;
    private final SmsCodeService smsCodeService;
    private final AccountDeletionExecutor executor;

    /**
     * 注销状态（给账号安全页看的一句话）：有没有待生效的申请，以及哪一刻生效。
     *
     * @param requested 是否已提交申请（true = 冷静期中）
     * @param effectiveAt 生效时刻 = 申请时刻 + 冷静期；未申请为 null
     */
    public record DeletionState(boolean requested, OffsetDateTime effectiveAt) {}

    public DeletionState status(UUID userId) {
        User user = requireActive(userId);
        OffsetDateTime requested = user.getDeletionRequestedAt();
        return new DeletionState(
                requested != null, requested == null ? null : requested.plus(AccountDeletionTimeouts.COOLING_OFF));
    }

    /** 发注销验证码到本人绑定手机号（号码取 token 背后的账号，不让前端自报，故无需图形验证码） */
    public void sendCode(UUID userId, String clientIp) {
        User user = requireActive(userId);
        Validate.isTrue(user.getDeletionRequestedAt() == null, 409, "已提交注销申请，可在账号安全页撤销");
        smsCodeService.sendDeletionCode(user.getPhone(), clientIp);
    }

    /**
     * 提交注销申请：先消费一次性验证码，再落申请时刻。
     *
     * <p>校验码在前、写库在后：写库失败（并发/已申请）浪费一枚码，反过来则等于「没过验证就能注销」，
     * 前者只是重发一次的烦，后者是漏洞。
     */
    public void request(UUID userId, String code) {
        User user = requireActive(userId);
        smsCodeService.verifyDeletionCode(user.getPhone(), code);
        OffsetDateTime now = OffsetDateTime.now();
        Validate.isTrue(userMapper.markDeletionRequested(userId, now) > 0, 409, "账号状态已变化或已有待生效的注销申请，请刷新后重试");
        log.info("[ACCOUNT] 注销申请已提交, userId={}, 生效于={}", userId, now.plus(AccountDeletionTimeouts.COOLING_OFF));
    }

    /** 撤销注销申请（冷静期内）：清空申请时刻，账号回到申请前的完全同一状态 */
    public void cancel(UUID userId) {
        OffsetDateTime now = OffsetDateTime.now();
        Validate.isTrue(userMapper.cancelDeletion(userId, now) > 0, 409, "没有待生效的注销申请");
        log.info("[ACCOUNT] 注销申请已撤销, userId={}", userId);
    }

    /**
     * 扫描并执行到期的注销申请（定时任务入口），返回本轮真正落地笔数。
     *
     * <p>逐笔独立事务（在 {@link AccountDeletionExecutor} 上），一批里第 3 笔失败不牵连前 2 笔；
     * 无分布式锁——资格判定全在 {@code anonymize} 的条件更新里，多实例并发扫描同一行只有一个赢。
     */
    public int sweep() {
        OffsetDateTime now = OffsetDateTime.now();
        List<UUID> due = userMapper.selectDeletionDue(now.minus(AccountDeletionTimeouts.COOLING_OFF), BATCH_LIMIT);
        int executed = 0;
        for (UUID userId : due) {
            if (executor.execute(userId, OffsetDateTime.now())) {
                executed++;
            }
        }
        return executed;
    }

    /**
     * 账号必须存在且正常。两件事分开拒：
     *
     * <ul>
     *   <li><b>已注销</b> → 与「从未存在」同一答案（404 用户不存在）：身份已经封存，不再是一个可操作的主体。
     *       正常情况下这条路走不到（会话已吊销、手机号已释放），留这一格是给在途 access token 的十分钟窗口。
     *   <li><b>被禁用</b> → 不给自助注销（403 USER_DISABLED）：封号是平台在追的事，注销不该成为
     *       「把追踪线索自我销毁」的出口，要注销先由平台解禁（ACC-76）。
     * </ul>
     */
    private User requireActive(UUID userId) {
        User user = Validate.notNull(userMapper.selectById(userId), "用户不存在");
        if (user.getDeletedAt() != null) {
            throw BusinessException.notFound("用户不存在");
        }
        if (!user.isActive()) {
            throw BusinessException.forbidden("USER_DISABLED", "账号已被禁用，请联系平台客服");
        }
        return user;
    }
}
