package com.shop.platform.audit.api;

import com.shop.platform.common.Validate;
import java.util.Arrays;

/**
 * 审计动作词表 —— 「谁对哪类对象做了什么」的唯一收口。
 *
 * <p>动作名与目标类型是同一格：一个动作只对应一类对象，不允许调用点自己拼 {@code targetType} 字符串。
 * 新增治理动作时在此加一格（同时在 docs/business-rules/crosscut.md 的审计条目里补规则编号），
 * 不要在业务模块里新起一个同义写法——审计查询按 {@code action} 归组，两份写法就是两组查不到的账。
 *
 * <p>命名沿用业务事件目录的形状（{@code 域.实体.动词}），但两者不是一回事：事件进日志（可滚失、按 trace 检索），
 * 审计进库（不可变、按人/对象/时间查）。这里只立真正有后果的治理动作，查询类操作不进账。
 */
public enum AuditAction {

    /** 买家账号禁用/启用（ACC 治理动作） */
    ACCOUNT_USER_STATUS_CHANGED("account.user.status_changed", AuditTargetType.USER),
    /** 平台员工禁用/启用 */
    ACCOUNT_STAFF_STATUS_CHANGED("account.staff.status_changed", AuditTargetType.STAFF),
    /** 平台员工创建 */
    ACCOUNT_STAFF_CREATED("account.staff.created", AuditTargetType.STAFF),
    /** 平台员工岗位调整 */
    ACCOUNT_STAFF_ROLE_CHANGED("account.staff.role_changed", AuditTargetType.STAFF),

    /** 用户券作废（CPN 运营动作） */
    COUPON_USER_COUPON_VOIDED("coupon.user_coupon.voided", AuditTargetType.USER_COUPON),

    /** 店铺入驻审核决定（通过/拒绝） */
    SHOP_REVIEW_DECIDED("shop.review.decided", AuditTargetType.SHOP_REVIEW),
    /** 平台封店（停止营业，级联下架） */
    SHOP_TRADING_SUSPENDED("shop.trading_suspended", AuditTargetType.SHOP),
    /** 平台解封（恢复营业，不自动重上架） */
    SHOP_TRADING_RESUMED("shop.trading_resumed", AuditTargetType.SHOP),

    /** 物流异常单处置（客服结单） */
    LOGISTICS_SHIPMENT_ISSUE_RESOLVED("logistics.shipment_issue.resolved", AuditTargetType.SHIPMENT_ISSUE),
    /** 物流轨迹补录/纠错（OPS 维护轨迹） */
    LOGISTICS_TRACKING_WRITTEN("logistics.tracking.written", AuditTargetType.SHIPMENT);

    private final String code;
    private final AuditTargetType targetType;

    AuditAction(String code, AuditTargetType targetType) {
        this.code = code;
        this.targetType = targetType;
    }

    /** 落库的 action 文本 */
    public String code() {
        return code;
    }

    /** 该动作唯一合法的目标类型（由本枚举决定，调用点无从选择） */
    public AuditTargetType targetType() {
        return targetType;
    }

    /** wire 值 → 动作，未知返回 null（筛选入参的 400 由 {@link #require} 把关，不按 null 放行） */
    public static AuditAction parseOrNull(String code) {
        return Arrays.stream(values())
                .filter(action -> action.code.equals(code))
                .findFirst()
                .orElse(null);
    }

    /** 按 code 取动作并拒绝未知值（审计是追责入口，宁可 400 也不给错口径） */
    public static AuditAction require(String code) {
        AuditAction action = parseOrNull(code);
        Validate.isTrue(action != null, "非法的审计动作筛选值");
        return action;
    }
}
