package com.shop.platform.trust.controller;

import com.shop.platform.common.BusinessException;
import com.shop.platform.infra.security.Authorizer;
import com.shop.platform.infra.security.CurrentOperator;
import com.shop.platform.infra.security.Permission;
import com.shop.platform.trust.mapper.TrustClueMapper;
import com.shop.platform.trust.service.TrustClueService;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 违规线索的管理端清单。**只读**：处置（扣分/限流）还没做，这里不提供任何写入口——
 * 看到了线索，动作还是人工的（联系商家、售后介入）。
 */
@RestController
@RequestMapping("/api/admin/trust/clues")
public class AdminTrustClueController {

    private static final int MAX_PAGE_SIZE = 200;

    private final TrustClueService clues;
    private final Authorizer authorizer;

    public AdminTrustClueController(TrustClueService clues, Authorizer authorizer) {
        this.clues = clues;
        this.authorizer = authorizer;
    }

    /**
     * @param status open / acknowledged / dismissed；不传 = 全部，待处理在前
     */
    @GetMapping
    public List<TrustClueMapper.ClueRow> list(
            @RequestParam(required = false) String status, @RequestParam(defaultValue = "100") int limit) {
        if (status != null
                && !status.isBlank()
                && !List.of("open", "acknowledged", "dismissed").contains(status)) {
            // 状态值直接进 SQL 参数不担心注入，但拼错的状态会静默查成空清单——当场说清
            throw BusinessException.badRequest("未知状态: " + status);
        }
        authorizer.check(Permission.TRUST_REVIEW);
        if (!CurrentOperator.TYPE_STAFF.equals(authorizer.current().operatorType())) {
            throw BusinessException.forbidden("STAFF_ONLY", "只有平台员工可以看违规线索");
        }
        return clues.list(status == null || status.isBlank() ? null : status, Math.clamp(limit, 1, MAX_PAGE_SIZE));
    }
}
