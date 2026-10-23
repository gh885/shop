package com.shop.platform.returns.controller;

import com.shop.platform.common.BusinessException;
import com.shop.platform.infra.security.Authorizer;
import com.shop.platform.infra.security.CurrentOperator;
import com.shop.platform.returns.api.AfterSaleCommand;
import com.shop.platform.returns.api.AfterSaleQuery;
import com.shop.platform.returns.api.CaseView;
import java.util.List;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
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

    private final AfterSaleCommand command;
    private final AfterSaleQuery query;
    private final Authorizer authorizer;

    public SellerAfterSaleController(AfterSaleCommand command, AfterSaleQuery query, Authorizer authorizer) {
        this.command = command;
        this.query = query;
        this.authorizer = authorizer;
    }

    @GetMapping
    public List<CaseView> mine(@RequestParam(defaultValue = "20") int limit) {
        return query.listByMerchant(merchantId(), limit);
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

    @PostMapping("/{caseId}/confirm-refund")
    public CaseView confirmRefund(@PathVariable UUID caseId) {
        return command.confirmRefund(caseId, merchantId());
    }

    private UUID merchantId() {
        CurrentOperator operator = authorizer.current();
        if (!CurrentOperator.TYPE_SELLER.equals(operator.operatorType()) || operator.merchantId() == null) {
            throw BusinessException.conflict("只有商家能处理售后");
        }
        return operator.merchantId();
    }
}
