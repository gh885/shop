package com.shop.platform.payment.service;

import com.shop.platform.common.BusinessException;
import com.shop.platform.payment.api.PaymentCommand;
import com.shop.platform.payment.events.RefundSucceeded;
import com.shop.platform.payment.mapper.SuspenseStore;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Component;

/**
 * 挂账待查的读侧与善后：清单、原路退款、驳回。写入不在这里——三条写入路径
 * （迟到回调 / 金额不符 / 订单已关）在 {@link PaymentService} 里，紧挨着各自的事实来源。
 *
 * <p><b>退款按挂账金额原路退</b>：挂的是"实际到账"的钱，不是订单应付——金额不符的单
 * 两边本来就不等，按应付退会把渠道多收的那部分白送给买家。销账不在这里做：
 * {@code RefundSucceeded} 到了才算钱真的出去了，渠道没受理（返回失败）挂账行保持 open，
 * 下次接着退。
 */
@Component
public class SuspenseService {

    private static final Logger log = LoggerFactory.getLogger(SuspenseService.class);

    private final SuspenseStore suspense;
    private final RefundService refunds;

    public SuspenseService(SuspenseStore suspense, RefundService refunds) {
        this.suspense = Objects.requireNonNull(suspense, "suspense");
        this.refunds = Objects.requireNonNull(refunds, "refunds");
    }

    /** 挂账清单，open 在前。 */
    public List<SuspenseStore.SuspenseRow> list() {
        return suspense.list();
    }

    /**
     * 按挂账金额原路退款。幂等键是 reason 里的挂账行 id：重复点退款返回同一张退款单，
     * 不会退两次。
     *
     * @return success=false = 渠道没受理，挂账行保持 open 等下次
     */
    public PaymentCommand.Refund refund(UUID suspenseId) {
        SuspenseStore.SuspenseRow row = requireOpen(suspenseId);
        return refunds.refundSuspense(row.paymentId(), row.amount(), row.currency(), suspenseRefundReason(suspenseId));
    }

    /**
     * 驳回：确认这不是要退的钱（渠道对账后撤回、测试数据、已线下处理）。
     * 必须留 note——没有理由的"驳回真钱"三个月后没人解释得清。
     */
    public void dismiss(UUID suspenseId, String note) {
        requireOpen(suspenseId);
        if (note == null || note.isBlank()) {
            throw BusinessException.badRequest("驳回必须写明原因");
        }
        if (!suspense.resolve(suspenseId, "dismissed", note.trim())) {
            throw BusinessException.conflict("挂账行不是待处理状态: " + suspenseId);
        }
        log.info("挂账驳回：id={} note={}", suspenseId, note);
    }

    /**
     * 退款成功 → 自动销账。售后正常退款命不中任何挂账行（有挂账的支付单没有已支付订单，
     * 走不进售后），白跑一次 UPDATE；有挂账的，钱到了就该销。
     */
    @ApplicationModuleListener
    public void on(RefundSucceeded event) {
        int resolved = suspense.resolveRefundedByPayment(event.paymentId());
        if (resolved > 0) {
            log.info("挂账已随退款销账：payment={} 行数={}", event.paymentId(), resolved);
        }
    }

    private SuspenseStore.SuspenseRow requireOpen(UUID suspenseId) {
        SuspenseStore.SuspenseRow row =
                suspense.find(suspenseId).orElseThrow(() -> BusinessException.notFound("挂账记录不存在: " + suspenseId));
        if (!"open".equals(row.status())) {
            throw BusinessException.conflict("挂账行已处理: " + suspenseId + " → " + row.resolution());
        }
        return row;
    }

    private static String suspenseRefundReason(UUID suspenseId) {
        return "suspense:" + suspenseId;
    }
}
