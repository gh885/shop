package com.shop.telemetry.server.issues.web;

import com.shop.telemetry.server.issues.IssueService;
import com.shop.telemetry.server.issues.IssueSummary;
import java.util.List;
import java.util.Map;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 平台前端的读接口。
 *
 * <p>M0 没有鉴权（平台前端只在本机/内网跑）。**但归属照样进 SQL**：{@code projectId} 是路径参数
 * 且直接进 WHERE，等 M4 加多租户时，这里只需要在过滤器里把 projectId 换成人拿得到的项目集合，
 * 查询本身不用改——这就是"先把范围写进 SQL"的价值。
 */
@RestController
@Profile({"api", "all"})
class IssueController {

    private final IssueService issues;

    IssueController(IssueService issues) {
        this.issues = issues;
    }

    @GetMapping("/api/{projectId}/issues")
    List<IssueSummary> list(
            @PathVariable String projectId, @RequestParam(name = "limit", defaultValue = "50") int limit) {
        return issues.list(projectId, limit);
    }

    @GetMapping("/api/{projectId}/issues/{id}")
    ResponseEntity<Object> find(@PathVariable String projectId, @PathVariable long id) {
        return issues.find(projectId, id)
                .<ResponseEntity<Object>>map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "issue not found")));
    }
}
