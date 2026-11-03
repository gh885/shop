package com.shop.platform.returns.controller;

import com.shop.platform.common.BusinessException;
import com.shop.platform.common.PagingRules;
import com.shop.platform.infra.security.AccessScope;
import com.shop.platform.infra.security.Authorizer;
import com.shop.platform.infra.security.Permission;
import com.shop.platform.infra.web.Idempotency;
import com.shop.platform.returns.api.CaseView;
import com.shop.platform.returns.api.RmaCommand;
import com.shop.platform.returns.api.RmaQuery;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import java.util.UUID;
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
 *
 * <p><b>判权按动作的爆炸半径拆两档</b>（与权限码的拆分同因）：拒绝、留言、签收是
 * {@code after_sale_case:handle}（不动钱，可授予子账号）；同意与确认退款是
 * {@code after_sale_case:refund}（动钱出口）。店铺范围随凭据传进 service——
 * 子账号只碰授权店的售后。
 */
@RestController
@RequestMapping("/api/seller/returns")
public class SellerRmaController {

    /** 列表默认 20 条，最多 100——不设上限等于给一个拉全表的入口。 */
    private static final int MAX_PAGE_SIZE = 100;

    private final RmaCommand command;
    private final RmaQuery query;
    private final Authorizer authorizer;
    private final Idempotency idempotency;

    public SellerRmaController(RmaCommand command, RmaQuery query, Authorizer authorizer, Idempotency idempotency) {
        this.command = command;
        this.query = query;
        this.authorizer = authorizer;
        this.idempotency = idempotency;
    }

    /** 游标分页 + 类型/状态筛选，口径同买家侧列表。 */
    @GetMapping
    public RmaQuery.CasePage listSellerCases(
            @Min(1) @Max(PagingRules.MAX_LIMIT) @RequestParam(defaultValue = "20") int limit,
            @RequestParam(required = false) String type,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String cursor) {
        AccessScope.Seller scope = authorizer.seller(Permission.ORDER_READ);
        return query.pageByMerchant(scope, type, status, cursor, Math.clamp(limit, 1, MAX_PAGE_SIZE));
    }

    @GetMapping("/{caseId}")
    public CaseView getSellerCase(@PathVariable UUID caseId) {
        AccessScope.Seller scope = authorizer.seller(Permission.ORDER_READ);
        return query.findForMerchant(caseId, scope).orElseThrow(() -> BusinessException.notFound("售后单不存在: " + caseId));
    }

    @PostMapping("/{caseId}/approve")
    public CaseView approveCase(@PathVariable UUID caseId) {
        AccessScope.Seller scope = authorizer.seller(Permission.AFTER_SALE_CASE_REFUND);
        return command.approve(caseId, scope);
    }

    @PostMapping("/{caseId}/reject")
    public CaseView rejectCase(@PathVariable UUID caseId, @RequestParam String reason) {
        AccessScope.Seller scope = authorizer.seller(Permission.AFTER_SALE_CASE_HANDLE);
        return command.reject(caseId, scope, reason);
    }

    @PostMapping("/{caseId}/receive")
    public CaseView receiveCase(@PathVariable UUID caseId) {
        AccessScope.Seller scope = authorizer.seller(Permission.AFTER_SALE_CASE_HANDLE);
        return command.receive(caseId, scope);
    }

    /**
     * 确认退款。支持 {@code Idempotency-Key}：响应丢失后的重试原样返回第一次结果，
     * 而不是对已推进的状态弹一句 409。
     */
    @PostMapping("/{caseId}/confirm-refund")
    public ResponseEntity<CaseView> confirmRefund(
            @PathVariable UUID caseId,
            @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey) {
        AccessScope.Seller scope = authorizer.seller(Permission.AFTER_SALE_CASE_REFUND);
        return idempotency.execute(
                "refund-confirm:" + scope.operatorId(),
                idempotencyKey,
                CaseView.class,
                () -> command.confirmRefund(caseId, scope));
    }
}
