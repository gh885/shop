package com.shop.platform.clearing.controller;

import com.shop.platform.clearing.service.ReconciliationService;
import com.shop.platform.common.PagingRules;
import com.shop.platform.infra.security.Authorizer;
import com.shop.platform.infra.security.Permission;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 平台侧对账入口。
 *
 * <p>两个动作：看最近几次跑得怎么样、立刻跑一次。**没有"修一下"的端点**——
 * 差异只报告不抹平，修账是开反向分录，那是账务流程，不是一个按钮。
 *
 * <p>只读接口也要权限点：对账报告会把全平台账户的余额结构整页摊开。
 */
@RestController
@RequestMapping("/api/admin/clearing/reconciliation")
public class AdminReconciliationController {

    /** 默认看 10 次。日终一天一次，10 次够覆盖"最近一周多"。 */
    private static final int DEFAULT_RECENT = 10;

    private final ReconciliationService reconciliation;
    private final Authorizer authorizer;

    public AdminReconciliationController(ReconciliationService reconciliation, Authorizer authorizer) {
        this.reconciliation = reconciliation;
        this.authorizer = authorizer;
    }

    /** 最近几次对账，新的在前。 */
    @GetMapping
    public List<ReconciliationService.Report> recent(
            @Min(1) @Max(PagingRules.MAX_LIMIT) @RequestParam(required = false, defaultValue = "" + DEFAULT_RECENT)
                    int limit) {
        authorizer.platform(Permission.RECONCILIATION_STATEMENT_READ);
        return reconciliation.recent(limit);
    }

    /**
     * 立刻跑一次。日终任务之外的手动入口——改完一处数据想马上知道账还对不对。
     *
     * <p>POST 而不是 GET：它会写一条 {@code reconciliation_run}，不是幂等查询。
     */
    @PostMapping("/run")
    public ReconciliationService.Report run() {
        authorizer.platform(Permission.RECONCILIATION_STATEMENT_READ);
        return reconciliation.run();
    }
}
