package com.shop.platform.payment.controller;

import com.shop.platform.common.BusinessException;
import com.shop.platform.infra.security.Authorizer;
import com.shop.platform.infra.security.CurrentOperator;
import com.shop.platform.infra.security.Permission;
import com.shop.platform.infra.web.Idempotency;
import com.shop.platform.payment.api.PaymentCommand;
import com.shop.platform.payment.mapper.SuspenseStore;
import com.shop.platform.payment.service.SuspenseService;
import java.util.List;
import java.util.UUID;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 平台侧挂账入口："钱到了但推进不了"的统一出口。清单、退款、驳回三个动作，
 * 写入不在控制器——三条登记路径在回调与事件消费里，钱的事实发生在哪里就在哪里记。
 *
 * <p>退款是 POST 不是 GET：它打渠道、动真钱。**没有"批量退款"端点**——每一条挂账
 * 都该被人看一眼再点，批量是把"逐条确认"退化成"一键放行"。
 */
@RestController
@RequestMapping("/api/admin/payments/suspense")
public class AdminSuspenseController {

    private final SuspenseService suspense;
    private final Authorizer authorizer;
    private final StringRedisTemplate redis;

    public AdminSuspenseController(SuspenseService suspense, Authorizer authorizer, StringRedisTemplate redis) {
        this.suspense = suspense;
        this.authorizer = authorizer;
        this.redis = redis;
    }

    /** 挂账清单，待处理在前。 */
    @GetMapping
    public List<SuspenseStore.SuspenseRow> list() {
        staffWith(Permission.SUSPENSE_MANAGE);
        return suspense.list();
    }

    /**
     * 按挂账金额原路退款。渠道没受理时挂账行保持待处理，可重复点。
     *
     * <p>支持 {@code Idempotency-Key}：退款响应丢失后的重试原样返回第一次结果，
     * 而不是靠"同因去重"兜出一句 409。
     */
    @PostMapping("/{id}/refund")
    public ResponseEntity<PaymentCommand.Refund> refund(
            @PathVariable UUID id, @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey) {
        staffWith(Permission.SUSPENSE_MANAGE);
        String operatorId = authorizer.current().operatorId().toString();
        return Idempotency.execute(
                redis,
                "suspense-refund:" + operatorId,
                idempotencyKey,
                PaymentCommand.Refund.class,
                () -> suspense.refund(id));
    }

    /** 驳回：确认这不是要退的钱。必须写原因。 */
    @PostMapping("/{id}/dismiss")
    public void dismiss(@PathVariable UUID id, @RequestBody DismissRequest request) {
        staffWith(Permission.SUSPENSE_MANAGE);
        suspense.dismiss(id, request.note());
    }

    public record DismissRequest(String note) {}

    private void staffWith(Permission permission) {
        authorizer.check(permission);
        CurrentOperator operator = authorizer.current();
        if (!CurrentOperator.TYPE_STAFF.equals(operator.operatorType())) {
            throw BusinessException.forbidden("STAFF_ONLY", "只有平台员工可以操作挂账");
        }
    }
}
