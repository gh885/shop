package com.shop.platform.returns.controller;

import com.shop.platform.infra.security.Authorizer;
import com.shop.platform.returns.api.AfterSaleCommand;
import com.shop.platform.returns.api.AfterSaleQuery;
import com.shop.platform.returns.api.CaseView;
import com.shop.platform.returns.dto.AfterSaleApplyRequest;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 买家侧售后入口。
 *
 * <p>越权统一 404：告诉对方"这张售后单存在但不是你的"，等于确认了这个 id。
 */
@RestController
@RequestMapping("/api/returns")
public class BuyerAfterSaleController {

    private final AfterSaleCommand command;
    private final AfterSaleQuery query;
    private final Authorizer authorizer;

    public BuyerAfterSaleController(AfterSaleCommand command, AfterSaleQuery query, Authorizer authorizer) {
        this.command = command;
        this.query = query;
        this.authorizer = authorizer;
    }

    @PostMapping
    public CaseView apply(@Valid @RequestBody AfterSaleApplyRequest request) {
        return command.apply(new AfterSaleCommand.ApplyRequest(
                authorizer.current().operatorId(),
                request.sellerOrderId(),
                request.type(),
                request.reasonCode(),
                request.lines().stream()
                        .map(line -> new AfterSaleCommand.ApplyRequest.Line(line.lineNo(), line.quantity()))
                        .toList()));
    }

    @GetMapping("/{caseId}")
    public CaseView find(@PathVariable UUID caseId) {
        return query.find(caseId)
                .filter(view -> view.buyerId().equals(authorizer.current().operatorId()))
                .orElseThrow(() -> com.shop.platform.common.BusinessException.notFound("售后单不存在: " + caseId));
    }

    @GetMapping
    public List<CaseView> mine(@RequestParam(defaultValue = "20") int limit) {
        return query.listByBuyer(authorizer.current().operatorId(), limit);
    }

    @PostMapping("/{caseId}/cancel")
    public CaseView cancel(@PathVariable UUID caseId) {
        return command.cancel(caseId, authorizer.current().operatorId());
    }

    @PostMapping("/{caseId}/ship-back")
    public CaseView shipBack(
            @PathVariable UUID caseId, @RequestParam String carrierCode, @RequestParam String trackingNo) {
        return command.shipBack(caseId, authorizer.current().operatorId(), carrierCode, trackingNo);
    }
}
