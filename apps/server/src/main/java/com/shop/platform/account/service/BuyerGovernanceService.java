package com.shop.platform.account.service;

import com.shop.platform.account.mapper.BuyerMapper;
import com.shop.platform.audit.api.AuditCommand;
import com.shop.platform.audit.api.AuditEntry;
import com.shop.platform.audit.api.FieldChange;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.EntityStatus;
import com.shop.platform.common.PhoneNumber;
import com.shop.platform.infra.security.RefreshTokenStore;
import com.shop.platform.infra.web.CursorCodec;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 平台侧买家治理：封禁 / 解封。唯一的写入口。
 *
 * <p><b>为什么需要它。</b> 买家的 {@code status} 列一直存在，{@code BuyerOperatorResolver} 也一直按它滤，
 * 但**没有任何入口能改它**——封号只能靠 SQL。于是「这个账号被停用了」这件事在库里是真的、
 * 在系统里却做不出来。
 *
 * <p><b>三条与员工封禁不同的处理：</b>
 *
 * <ul>
 *   <li><b>可以封自己吗？</b> 这里没有「不能操作自己」的闸门。买家与员工是两套身份，
 *       平台员工手里没有买家 id；真有同一个自然人两边都有账号的情况，封自己的买家账号不构成越权。
 *   <li><b>末位保护？</b> 没有。封买家不会让平台失去治理能力——这也是为什么
 *       {@code BUYER_MANAGE} 与 {@code STAFF_MANAGE} 是两个点。
 *   <li><b>吊销会话。</b> 与员工封禁一致且同样必要：判权每请求查库是第一道，
 *       会话吊销是第二道。只做第一道的话，买家手里那个 refresh 还能续出新的 access——
 *       封禁在 access 过期（15 分钟）前等于没生效。
 * </ul>
 */
@Service
public class BuyerGovernanceService {

    private static final Logger log = LoggerFactory.getLogger(BuyerGovernanceService.class);

    private final BuyerMapper buyers;
    private final RefreshTokenStore refreshTokenStore;
    private final AuditCommand audit;

    public BuyerGovernanceService(BuyerMapper buyers, RefreshTokenStore refreshTokenStore, AuditCommand audit) {
        this.buyers = Objects.requireNonNull(buyers, "buyers");
        this.refreshTokenStore = Objects.requireNonNull(refreshTokenStore, "refreshTokenStore");
        this.audit = Objects.requireNonNull(audit, "audit");
    }

    /**
     * 封禁 / 解封。
     *
     * <p>顺序是「先读、再条件写、再吊销会话、再记账」：
     *
     * <ol>
     *   <li><b>先读</b>只为 404 与审计里的前后值——不作为写入的起点状态。
     *       拿它当起点会在并发下写出「A 管理员看到 active、B 管理员刚封了、A 又写回 active」的丢更新。
     *   <li><b>条件写</b>带 {@code status <> target}，0 行是判决：已是目标状态、或并发抢先、或账号已注销。
     *       统一回 409 而不是静默成功——静默会让「点了没反应」和「已经生效」看起来一样。
     *   <li><b>吊销会话</b>只在真的封了之后做。0 行时不吊销——那时可能已经有别人解封了。
     *   <li><b>记账</b>与业务同事务。手机号只落掩码：审计账本会被导出、被第三方联调看，
     *       明文号码进那里就是把个保法义务往后推了一步。
     * </ol>
     */
    @Transactional
    public void updateStatus(UUID buyerId, String status, UUID staffId) {
        if (!EntityStatus.ALL.contains(status)) {
            // 状态词表在 DTO 上已经用 @Pattern 卡过一道；这里再卡一道是因为
            // service 也会被内部调用（将来的批量处置），那时没有 DTO 校验。
            throw BusinessException.badRequest("未知的账号状态: " + status);
        }
        BuyerMapper.BuyerRow buyer =
                buyers.find(buyerId).orElseThrow(() -> BusinessException.notFound("买家不存在: " + buyerId));

        boolean disabling = EntityStatus.DISABLED.equals(status);
        if (!buyers.updateStatus(buyerId, status)) {
            // 三种来历合一：已是目标状态 / 并发抢先 / 账号已注销。区分它们要再读一次库，
            // 而那一次读在并发下仍然不准——不如统一回 409 让前端刷新。
            throw BusinessException.conflict("账号状态已变化，请刷新后重试");
        }
        if (disabling) {
            refreshTokenStore.revokeAll(buyerId.toString());
        }

        audit.record(AuditEntry.byStaff(
                "account.buyer.status_changed",
                "buyer",
                buyerId.toString(),
                staffId,
                null,
                Map.of(
                        "status", FieldChange.of(buyer.status(), status),
                        "phone", FieldChange.to(PhoneNumber.mask(buyer.phone())))));

        log.info("[BUYER] 状态变更, buyerId={}, {} -> {}, operator={}", buyerId, buyer.status(), status, staffId);
    }

    /**
     * 后台买家列表。关键字同时匹配手机号与昵称，游标是 {@code (created_at, id)}。
     *
     * <p>返回的行里手机号已脱敏——见 {@link AdminBuyerView}。
     */
    @Transactional(readOnly = true)
    public BuyerAdminPage adminPage(String status, String keyword, String cursor, int limit) {
        if (status != null && !status.isBlank() && !EntityStatus.ALL.contains(status)) {
            // 筛错词回 400，不放进去变成永远空页
            throw BusinessException.badRequest("未知的账号状态: " + status);
        }
        CursorCodec.Point point = cursor == null || cursor.isBlank() ? null : CursorCodec.decode(cursor);
        List<BuyerMapper.AdminBuyerRow> rows = buyers.listForAdmin(
                status == null || status.isBlank() ? null : status,
                keyword == null || keyword.isBlank() ? null : keyword.trim(),
                point == null ? null : OffsetDateTime.ofInstant(point.createdAt(), ZoneOffset.UTC),
                point == null ? null : point.id(),
                limit + 1);

        boolean hasMore = rows.size() > limit;
        List<BuyerMapper.AdminBuyerRow> page = hasMore ? rows.subList(0, limit) : rows;
        String nextCursor = hasMore
                ? CursorCodec.encode(
                        page.getLast().createdAt().toInstant(), page.getLast().buyerId())
                : null;

        return new BuyerAdminPage(
                page.stream()
                        .map(row -> new AdminBuyerView(
                                row.buyerId(),
                                PhoneNumber.mask(row.phone()),
                                row.displayName(),
                                row.status(),
                                row.createdAt()))
                        .toList(),
                nextCursor);
    }

    /**
     * 后台列表的一行。手机号已脱敏——{@code 138****5678} 够认出是哪个号。
     *
     * <p>不给完整号码是有意的：列表页会把 20–100 个手机号一次摊在屏幕上，那是可以直接拿去营销 / 撞库的数据。
     * 真要看完整号码是另一件事（带审计的查看动作），不该顺带在列表里给。
     */
    public record AdminBuyerView(
            UUID buyerId, String phone, String displayName, String status, OffsetDateTime createdAt) {}

    /** 一页。{@code nextCursor} 为 null 就是最后一页。 */
    public record BuyerAdminPage(List<AdminBuyerView> items, @Schema(nullable = true) String nextCursor) {}
}
