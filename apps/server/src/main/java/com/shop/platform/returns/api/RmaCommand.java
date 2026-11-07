package com.shop.platform.returns.api;

import com.shop.platform.infra.security.AccessScope;
import java.util.List;
import java.util.UUID;

/**
 * 售后单的写入口。买家提交、商家处理、买家寄回、商家收货，都走这里。
 *
 * <p>状态推进只认 {@code deadline_actor} 对应的角色：商家不能替买家撤销，买家不能替商家收货。
 * 越权一律拒，不是"尽力而为"。
 */
public interface RmaCommand {

    /**
     * 买家提交售后。
     *
     * <p>金额在提交时就算好并落库——不是等商家同意再算。原因：商家看到的就是买家申请的数字，
     * 两边对着同一个数谈，事后算一遍只会多一个说法。
     *
     * @throws com.shop.platform.common.BusinessException 行不属于这个买家、数量超限、
     *     {@code REFUND_EXCEEDS_PAID}（金额超过实付）、{@code INVALID_CASE_STATE}（已有未终态 case）
     */
    CaseView apply(ApplyRequest request);

    /**
     * 商家同意。仅退款直接进 {@code refunding}；退货退款/换货进 {@code approved} 等买家寄回。
     * scope 是判权凭据：商家归属与店铺授权都随它进来，收窄到授权店。
     */
    CaseView approve(UUID caseId, AccessScope.Seller scope);

    /** 商家拒绝，必须给理由——理由进 {@code case_log}，买家侧要看到。 */
    CaseView reject(UUID caseId, AccessScope.Seller scope, String reason);

    /** 买家撤销。已经寄回的货不在这里处理，走线下或新 case。 */
    CaseView cancel(UUID caseId, UUID buyerId);

    /** 买家填退货运单号，进入 {@code shipping_back}。 */
    CaseView shipBack(UUID caseId, UUID buyerId, String carrierCode, String trackingNo);

    /** 商家签收退货，进入 {@code received}，48 小时不确认就自动退款。 */
    CaseView receive(UUID caseId, AccessScope.Seller scope);

    /** 商家确认退款：同步调 {@code payment.refund}，钱由 payment 退，状态停在 {@code refunding}。 */
    CaseView confirmRefund(UUID caseId, AccessScope.Seller scope);

    /**
     * 商家补发（换货）：填新运单号，进入 {@code reshipping}。
     *
     * <p>重发的新包裹由商家自己的物流走，不在 fulfillment 建包裹——逆向物流只记买家寄回那一段
     * （[rma.md](../../../../../docs/domain/rma.md) §3）。补发在途 7 天没人异议就自动完成；
     * 收货后 48 小时不补发则兜底自动转退款——商家一手拿着退回的货一手拿着钱，拖着两头都不给是不允许的。
     */
    CaseView reship(UUID caseId, AccessScope.Seller scope, String carrierCode, String trackingNo);

    /**
     * @param type 仅退款 / 退货退款 / 换货
     * @param lines 一次可以退多行；每行只能退该行还没退过的数量
     */
    record ApplyRequest(UUID buyerId, UUID sellerOrderId, String type, String reasonCode, java.util.List<Line> lines) {

        public ApplyRequest {
            lines = List.copyOf(lines);
            if (lines.isEmpty()) {
                throw new IllegalArgumentException("售后至少要有一行");
            }
        }

        /** 买家只知道自己看到的行号，所以这里收 {@code lineNo}，行 id 由服务端解析。 */
        public record Line(int lineNo, int quantity) {}
    }
}
