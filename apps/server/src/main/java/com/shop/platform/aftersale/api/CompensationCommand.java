package com.shop.platform.aftersale.api;

import com.shop.platform.aftersale.mapper.Refund;
import com.shop.platform.aftersale.mapper.RefundLine;
import com.shop.platform.aftersale.mapper.RefundLineMapper;
import com.shop.platform.aftersale.mapper.RefundMapper;
import com.shop.platform.aftersale.model.RefundLineType;
import com.shop.platform.aftersale.model.RefundStatus;
import com.shop.platform.aftersale.model.RefundType;
import com.shop.platform.aftersale.service.RefundExecutionService;
import com.shop.platform.common.Money;
import com.shop.platform.common.Text;
import com.shop.platform.common.Validate;
import com.shop.platform.order.api.OrderReadQuery;
import com.shop.platform.order.api.OrderRefundView;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 补偿命令（跨模块消费）：给买家退一笔钱、货不寄回，计入 {@code compensated_amount}，不占可退数量。
 *
 * <p>没有买家入口，也没有卖家工作台的常规按钮——补偿是运营/客服的处置决定，本期只开内部命令。
 * 它仍然是一张退款单：状态机、渠道执行、执行记录、重试与其他退款完全同一条路，模型里不开第二种钱。
 *
 * <p>上限只有一条模型级约束：{@code 已退 + 已补偿 + 本次 ≤ 实付}——不能把平台退出去的钱推过收到的钱。
 * 产品口径的补偿上限（例如按订单比例）另定，届时加在这里而不是改表。
 */
@Component
@Slf4j
@RequiredArgsConstructor
public class CompensationCommand {

    private final RefundMapper refundMapper;

    private final RefundLineMapper refundLineMapper;

    private final OrderReadQuery orderReadQuery;

    private final RefundExecutionService refundExecutionService;

    /**
     * 发放一笔补偿：建补偿型退款单（一条 COMPENSATION 行）→ 直接同意 → 发起退款。
     *
     * @return 退款单 id（便于调用方留痕/对账）
     */
    @Transactional
    public UUID grant(UUID orderId, Money amount, String reason) {
        // 1. 金额与币种：补偿是正数钱，且必须与订单同币种
        Validate.isTrue(amount.amount() > 0, "补偿金额必须大于 0");
        OrderRefundView order = Validate.present(orderReadQuery.refundViewById(orderId), "订单不存在");
        Validate.isTrue(order.payAmount().currency().equals(amount.currency()), "补偿币种与订单不一致");

        // 2. 模型级上限：退出去的钱（退款 + 补偿）不能超过实付
        long out = order.refundedAmount().amount() + order.compensatedAmount().amount() + amount.amount();
        Validate.conflict(out <= order.payAmount().amount(), "补偿金额超过订单剩余实付");

        // 3. 建单（补偿没有卖家审核环节，落单后直接同意并发起）
        Refund refund = Refund.builder()
                .tradeId(order.tradeId())
                .orderId(orderId)
                .userId(order.userId())
                .shopId(order.shopId())
                .refundNo(generateRefundNo())
                .type(RefundType.COMPENSATION)
                .status(RefundStatus.PENDING)
                .amount(amount.amount())
                .currency(amount.currency())
                .reason(Text.trimToNull(reason))
                .build();
        refundMapper.insert(refund);
        refundLineMapper.insert(RefundLine.builder()
                .refundId(refund.getId())
                .lineType(RefundLineType.COMPENSATION)
                .amount(amount.amount())
                .currency(amount.currency())
                .active(true)
                .build());

        // 4. 直接同意 → 退款中 → 执行。走别人的审核线只会让运营的处置卡在「待处理」
        Validate.conflict(refundMapper.markAgreed(refund.getId(), OffsetDateTime.now()) == 1, "补偿单状态异常");
        Validate.conflict(
                refundMapper.transition(refund.getId(), RefundStatus.AGREED, RefundStatus.REFUNDING) == 1, "补偿单状态异常");
        refundExecutionService.execute(refund.getId());
        log.info("[REFUND] 补偿, refundId={}, orderId={}, amount={}", refund.getId(), orderId, amount.amount());
        return refund.getId();
    }

    /** 退款单号：前缀 + 时间戳 + 主键随机段，只含字母数字（渠道幂等键要求），生成口径见 RefundNumbers */
    private static String generateRefundNo() {
        return com.shop.platform.aftersale.service.RefundNumbers.next("RC");
    }
}
