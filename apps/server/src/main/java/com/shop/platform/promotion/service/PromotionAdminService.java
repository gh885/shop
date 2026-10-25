package com.shop.platform.promotion.service;

import com.shop.platform.audit.api.AuditCommand;
import com.shop.platform.audit.api.AuditEntry;
import com.shop.platform.audit.api.FieldChange;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.ErrorCodes;
import com.shop.platform.promotion.api.AppliedRule;
import com.shop.platform.promotion.dto.RuleRequest;
import com.shop.platform.promotion.mapper.RuleMapper;
import com.shop.platform.promotion.mapper.RuleMapper.AdminDraft;
import com.shop.platform.promotion.mapper.RuleMapper.AdminRow;
import com.shop.platform.promotion.model.RuleStatus;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 促销规则的写侧。平台运营用。
 *
 * <p><b>这里不决定"减多少"</b>——{@code threshold / rate_bp / fixed_amount / base_mode} 原样存进表，
 * 怎么用是 {@code pricing} 的事。规则和算法分居两个模块，加一种玩法不用改这里。
 *
 * <p>三件事必须在这里判，因为库只挡住了一半：
 *
 * <ul>
 *   <li><b>比例与定额二选一</b>：库有 {@code ck_promotion_benefit}，但报出来是一句约束名。
 *       这里先判一次，用户看到的是"要么按比例、要么按定额"
 *   <li><b>时间窗</b>：库只保证 {@code ends_at > starts_at}，不保证"结束时间还没过"。
 *       启用一条已经结束的规则，等于上线一个永远不生效的活动——静默失效最难查
 *   <li><b>版本号</b>：不在这里加。加在 SQL 里，见 {@code UPDATE_CONTENT} 的注释
 * </ul>
 */
@Component
public class PromotionAdminService {

    private final RuleMapper store;
    private final AuditCommand audit;

    public PromotionAdminService(RuleMapper store, AuditCommand audit) {
        this.store = Objects.requireNonNull(store, "store");
        this.audit = Objects.requireNonNull(audit, "audit");
    }

    /** 新建一律 draft：规则直接影响所有买家看到的价格，启用要单独一次确认。 */
    @Transactional
    public RuleView create(UUID staffId, RuleRequest request) {
        AdminDraft draft = toDraft(request);
        UUID id = store.insert(draft);

        audit.record(AuditEntry.byStaff(
                "promotion.rule.saved",
                "promotion.rule",
                id.toString(),
                staffId,
                null,
                Map.of("name", FieldChange.to(draft.name()))));

        return view(store.find(id).orElseThrow());
    }

    /**
     * 改内容。draft 和 active 都能改，<b>active 改一次 version +1</b>。
     *
     * <p>为什么要 +1：报价单里 {@code price_quote_rule.rule_version} 记的是"当时是哪一版"。
     * 改了参数却不 +1，那个字段就变成了谎话——同一版号对应两套金额。
     */
    @Transactional
    public RuleView update(UUID staffId, UUID id, RuleRequest request) {
        AdminRow row = require(id);
        if (row.status().isReadOnly()) {
            throw archived();
        }

        AdminDraft draft = toDraft(request);
        if (store.updateContent(id, draft) == 0) {
            // 读完之后被别的请求归档了。挡在 where 里，不是挡在 if 里
            throw archived();
        }

        audit.record(AuditEntry.byStaff(
                "promotion.rule.saved",
                "promotion.rule",
                id.toString(),
                staffId,
                null,
                Map.of(
                        "name", FieldChange.of(row.name(), draft.name()),
                        "version", FieldChange.of(String.valueOf(row.version()), String.valueOf(row.version() + 1)))));

        return view(store.find(id).orElseThrow());
    }

    /** 启用。已经结束的规则拒绝启用——那会造出一个永远不生效的活动，而且没人会去看。 */
    @Transactional
    public RuleView activate(UUID staffId, UUID id) {
        AdminRow row = require(id);
        if (row.status().isReadOnly()) {
            throw archived();
        }
        if (row.endsAt() != null && !row.endsAt().isAfter(Instant.now())) {
            throw BusinessException.badRequest("这条规则的结束时间已经过了，改一下时间再启用");
        }

        if (store.setStatus(id, RuleStatus.ACTIVE) == 0) {
            throw archived();
        }

        audit.record(AuditEntry.byStaff(
                "promotion.rule.status_changed",
                "promotion.rule",
                id.toString(),
                staffId,
                null,
                Map.of("status", FieldChange.of(row.status().dbValue(), RuleStatus.ACTIVE.dbValue()))));

        return view(store.find(id).orElseThrow());
    }

    /** 归档。立刻从算价的规则集里消失，已发出的报价单不受影响（它们自己存了金额）。 */
    @Transactional
    public RuleView archive(UUID staffId, UUID id) {
        AdminRow row = require(id);
        if (row.status().isReadOnly()) {
            throw archived();
        }
        if (store.setStatus(id, RuleStatus.ARCHIVED) == 0) {
            throw archived();
        }

        audit.record(AuditEntry.byStaff(
                "promotion.rule.status_changed",
                "promotion.rule",
                id.toString(),
                staffId,
                null,
                Map.of("status", FieldChange.of(row.status().dbValue(), RuleStatus.ARCHIVED.dbValue()))));

        return view(store.find(id).orElseThrow());
    }

    // —— 读 ——

    /** @param status 可空；空 = 全部状态 */
    public List<RuleView> list(String status) {
        RuleStatus parsed = status == null || status.isBlank() ? null : parseStatus(status);
        return store.list(parsed).stream().map(PromotionAdminService::view).toList();
    }

    public RuleView get(UUID id) {
        return view(require(id));
    }

    // —— 内部 ——

    private AdminRow require(UUID id) {
        return store.find(id).orElseThrow(() -> BusinessException.notFound("促销规则不存在: " + id));
    }

    private static BusinessException archived() {
        return BusinessException.conflict(ErrorCodes.CONFIG_ARCHIVED, "已归档的促销规则不能再改，需要调整请新建一条");
    }

    private static RuleStatus parseStatus(String raw) {
        try {
            return RuleStatus.from(raw);
        } catch (IllegalArgumentException e) {
            throw BusinessException.badRequest("不支持的规则状态: " + raw);
        }
    }

    /**
     * 请求体 → 写入参数，顺带把库挡不住的那几条判掉。
     *
     * <p>{@code priority} 缺省 100：和表的默认值一致。前端不传就是"普通优先级"，
     * 不是 0——0 是最高的，把它当缺省会悄悄插到所有活动前面。
     */
    private static AdminDraft toDraft(RuleRequest request) {
        if ((request.rateBp() == null) == (request.fixedAmount() == null)) {
            throw BusinessException.badRequest("规则要么按比例减（rateBp），要么按定额减（fixedAmount），二选一");
        }
        if (request.startsAt() != null
                && request.endsAt() != null
                && !request.endsAt().isAfter(request.startsAt())) {
            throw BusinessException.badRequest("结束时间必须晚于开始时间");
        }

        return new AdminDraft(
                request.name().trim(),
                request.type().trim(),
                enumName(request.scope(), "scope"),
                enumName(request.bearer(), "bearer"),
                request.threshold(),
                request.rateBp(),
                request.fixedAmount(),
                enumName(request.baseMode(), "baseMode"),
                request.mutexGroup(),
                request.priority() == null ? 100 : request.priority(),
                request.categoryIds(),
                request.startsAt(),
                request.endsAt());
    }

    /**
     * 字符串 → 枚举名（小写）。
     *
     * <p>只做形状校验，不在这里转成枚举：库里存的是小写文本，转成枚举再转回来是绕路。
     * 但必须验一次——拼错一个字母会让 {@code ck_promotion_scope} 抛约束异常，
     * 那是 500 级别的信息，而这里是 400。
     */
    private static String enumName(String raw, String field) {
        String upper = raw == null ? "" : raw.trim().toUpperCase(Locale.ROOT);
        boolean valid =
                switch (field) {
                    case "scope" ->
                        List.of("LINE", "SELLER_ORDER", "ORDER_GROUP").contains(upper);
                    case "bearer" -> List.of("PLATFORM", "MERCHANT").contains(upper);
                    case "baseMode" -> List.of("ORIGINAL", "AFTER_PREVIOUS").contains(upper);
                    default -> false;
                };
        if (!valid) {
            throw BusinessException.badRequest("不支持的 " + field + ": " + raw);
        }
        return upper.toLowerCase(Locale.ROOT);
    }

    private static RuleView view(AdminRow row) {
        return new RuleView(
                row.id(),
                row.name(),
                row.type(),
                row.scope().name().toLowerCase(Locale.ROOT),
                row.bearer().name().toLowerCase(Locale.ROOT),
                row.threshold(),
                row.rateBp(),
                row.fixedAmount(),
                row.baseMode().name().toLowerCase(Locale.ROOT),
                row.mutexGroup(),
                row.priority(),
                row.categoryIds(),
                row.status().dbValue(),
                row.version(),
                row.startsAt(),
                row.endsAt(),
                row.createdAt(),
                row.updatedAt());
    }

    /**
     * 后台看到的形状。字段名与 {@link AppliedRule} 保持一致，方便对照"这条规则算价时被读成了什么"。
     *
     * @param categoryIds {@code null} = 全类目
     * @param rateBp      万分比；与 {@code fixedAmount} 互斥
     */
    public record RuleView(
            UUID id,
            String name,
            String type,
            String scope,
            String bearer,
            Long threshold,
            Integer rateBp,
            Long fixedAmount,
            String baseMode,
            String mutexGroup,
            int priority,
            List<UUID> categoryIds,
            String status,
            int version,
            Instant startsAt,
            Instant endsAt,
            Instant createdAt,
            Instant updatedAt) {}
}
