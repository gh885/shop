package com.shop.platform.returns.controller;

import com.shop.platform.common.BusinessException;
import com.shop.platform.infra.security.Authorizer;
import com.shop.platform.infra.security.CurrentOperator;
import com.shop.platform.infra.web.Idempotency;
import com.shop.platform.returns.api.AfterSaleCommand;
import com.shop.platform.returns.api.AfterSaleQuery;
import com.shop.platform.returns.api.CaseView;
import java.util.UUID;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 商家侧售后入口：同意、拒绝、签收、确认退款。
 *
 * <p>商家身份从令牌来，不从路径来——路径里传 merchantId 等于让任何人替别家处理售后。
 */
@RestController
@RequestMapping("/api/seller/returns")
public class SellerAfterSaleController {

    /** 列表默认 20 条，最多 100——不设上限等于给一个拉全表的入口。 */
    private static final int MAX_PAGE_SIZE = 100;

    private final AfterSaleCommand command;
    private final AfterSaleQuery query;
    private final Authorizer authorizer;
    private final StringRedisTemplate redis;

    public SellerAfterSaleController(
            AfterSaleCommand command, AfterSaleQuery query, Authorizer authorizer, StringRedisTemplate redis) {
        this.command = command;
        this.query = query;
        this.authorizer = authorizer;
        this.redis = redis;
    }

    /** 游标分页 + 类型/状态筛选，口径同买家侧列表。 */
    @GetMapping
    public AfterSaleQuery.CasePage mine(
            @RequestParam(defaultValue = "20") int limit,
            @RequestParam(required = false) String type,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String cursor) {
        return query.pageByMerchant(merchantId(), type, status, cursor, Math.clamp(limit, 1, MAX_PAGE_SIZE));
    }

    @GetMapping("/{caseId}")
    public CaseView find(@PathVariable UUID caseId) {
        return query.find(caseId)
                .filter(view -> view.merchantId().equals(merchantId()))
                .orElseThrow(() -> BusinessException.notFound("售后单不存在: " + caseId));
    }

    @PostMapping("/{caseId}/approve")
    public CaseView approve(@PathVariable UUID caseId) {
        return command.approve(caseId, merchantId());
    }

    @PostMapping("/{caseId}/reject")
    public CaseView reject(@PathVariable UUID caseId, @RequestParam String reason) {
        return command.reject(caseId, merchantId(), reason);
    }

    @PostMapping("/{caseId}/receive")
    public CaseView receive(@PathVariable UUID caseId) {
        return command.receive(caseId, merchantId());
    }

    /**
     * 确认退款。支持 {@code Idempotency-Key}：响应丢失后的重试原样返回第一次结果，
     * 而不是对已推进的状态弹一句 409。
     */
    @PostMapping("/{caseId}/confirm-refund")
    public ResponseEntity<CaseView> confirmRefund(
            @PathVariable UUID caseId,
            @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey) {
        UUID merchant = merchantId();
        return Idempotency.execute(
                redis,
                "refund-confirm:" + merchant,
                idempotencyKey,
                CaseView.class,
                () -> command.confirmRefund(caseId, merchant));
    }

    private UUID merchantId() {
        CurrentOperator operator = authorizer.current();
        if (!CurrentOperator.TYPE_SELLER.equals(operator.operatorType()) || operator.merchantId() == null) {
            throw BusinessException.conflict("只有商家能处理售后");
        }
        return operator.merchantId();
    }
}
