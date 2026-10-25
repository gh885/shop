package com.shop.platform.returns.controller;

import com.shop.platform.infra.security.Authorizer;
import com.shop.platform.returns.api.CaseView;
import com.shop.platform.returns.api.RmaCommand;
import com.shop.platform.returns.api.RmaQuery;
import com.shop.platform.returns.dto.RmaApplyRequest;
import jakarta.validation.Valid;
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
@RequestMapping("/api/buyer/returns")
public class BuyerRmaController {

    /** 列表默认 20 条，最多 100——不设上限等于给一个拉全表的入口。 */
    private static final int MAX_PAGE_SIZE = 100;

    private final RmaCommand command;
    private final RmaQuery query;
    private final Authorizer authorizer;

    public BuyerRmaController(RmaCommand command, RmaQuery query, Authorizer authorizer) {
        this.command = command;
        this.query = query;
        this.authorizer = authorizer;
    }

    @PostMapping
    public CaseView apply(@Valid @RequestBody RmaApplyRequest request) {
        return command.apply(new RmaCommand.ApplyRequest(
                authorizer.current().operatorId(),
                request.sellerOrderId(),
                request.type(),
                request.reasonCode(),
                request.lines().stream()
                        .map(line -> new RmaCommand.ApplyRequest.Line(line.lineNo(), line.quantity()))
                        .toList()));
    }

    @GetMapping("/{caseId}")
    public CaseView find(@PathVariable UUID caseId) {
        return query.findForBuyer(caseId, authorizer.current().operatorId())
                .orElseThrow(() -> com.shop.platform.common.BusinessException.notFound("售后单不存在: " + caseId));
    }

    /**
     * 我的售后单。游标分页：{@code nextCursor} 原样传回翻下一页；
     * {@code type}/{@code status} 按库里的词表筛（refund_only / return_refund，applied / approved / …）。
     */
    @GetMapping
    public RmaQuery.CasePage mine(
            @RequestParam(defaultValue = "20") int limit,
            @RequestParam(required = false) String type,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String cursor) {
        return query.pageByBuyer(
                authorizer.current().operatorId(), type, status, cursor, Math.clamp(limit, 1, MAX_PAGE_SIZE));
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
