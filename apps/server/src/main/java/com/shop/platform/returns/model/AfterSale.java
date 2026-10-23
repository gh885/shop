package com.shop.platform.returns.model;

import java.util.Locale;
import java.util.Set;

/**
 * 售后的三组枚举和一条推责任的规则。
 *
 * <p>三种类型共用一套状态机——区别只在"中间有没有一段货物往返"，所以 {@code type} 只决定
 * {@link CaseType#needsGoodsBack()}，不决定走哪张表、哪套流程。
 */
public final class AfterSale {

    private AfterSale() {}

    public enum CaseType {
        REFUND_ONLY,
        RETURN_REFUND,
        EXCHANGE;

        /** 仅退款不用寄回；退货退款和换货要。 */
        public boolean needsGoodsBack() {
            return this != REFUND_ONLY;
        }

        public String dbValue() {
            return name().toLowerCase(Locale.ROOT);
        }
    }

    public enum CaseStatus {
        APPLIED,
        APPROVED,
        REJECTED,
        CANCELLED,
        SHIPPING_BACK,
        RECEIVED,
        REFUNDING,
        RESHIPPING,
        COMPLETED,
        DISPUTED;

        /** 终态：不再参与超时扫描，也不再占住结算。 */
        public boolean terminal() {
            return this == COMPLETED || this == CANCELLED || this == REJECTED;
        }

        public String dbValue() {
            return name().toLowerCase(Locale.ROOT);
        }
    }

    public enum Responsibility {
        MERCHANT,
        BUYER,
        PLATFORM,
        UNDETERMINED;

        public String dbValue() {
            return name().toLowerCase(Locale.ROOT);
        }
    }

    /** 到期自动做什么。扫描器只执行、不判断——加一条新规则是加一个枚举值，不是加一个 if。 */
    public enum DeadlineAction {
        AUTO_APPROVE,
        AUTO_CLOSE,
        AUTO_REFUND,
        AUTO_SHIP;

        public String dbValue() {
            return name().toLowerCase(Locale.ROOT);
        }
    }

    /** 商家的责任：质量问题、错发漏发、描述不符。 */
    private static final Set<String> MERCHANT_FAULT =
            Set.of("QUALITY", "WRONG_ITEM", "MISSING_PART", "NOT_AS_DESCRIBED");

    /** 买家的责任：不喜欢、拍错。 */
    private static final Set<String> BUYER_FAULT = Set.of("NO_LONGER_WANTED", "WRONG_SIZE");

    /**
     * 由买家选的原因推出默认责任。
     *
     * <p>只是**默认值**：商家或平台可以改，改了必须写 {@code case_log}——判责被偷偷改掉，
     * 事后「这单为什么给退了」就只能靠猜。
     */
    public static Responsibility responsibilityOf(String reasonCode) {
        if (reasonCode == null) {
            return Responsibility.UNDETERMINED;
        }
        if (MERCHANT_FAULT.contains(reasonCode)) {
            return Responsibility.MERCHANT;
        }
        if (BUYER_FAULT.contains(reasonCode)) {
            return Responsibility.BUYER;
        }
        return Responsibility.UNDETERMINED;
    }
}
