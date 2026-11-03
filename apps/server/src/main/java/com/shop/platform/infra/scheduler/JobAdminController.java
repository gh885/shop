package com.shop.platform.infra.scheduler;

import com.shop.platform.infra.security.Authorizer;
import com.shop.platform.infra.security.Permission;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 平台侧任务入口：列出任务、手动触发一轮。
 *
 * <p>补发卡住、对账想立刻重跑、清理想提前做——这些时刻在没有这个入口时只能重启进程。
 * 触发与定时调度走同一个 {@code runNow()}（见 {@link ManualJob}），锁与幂等不因手动而绕过。
 *
 * <p>响应是 202 而不是任务结果：任务可能慢（退款重试最坏一批 × 渠道超时），HTTP 线程不等它；
 * 结果看 {@code shop.job.*} 指标和日志。
 */
@RestController
@RequestMapping("/api/admin/jobs")
public class JobAdminController {

    private final JobRegistry jobs;
    private final Authorizer authorizer;

    public JobAdminController(JobRegistry jobs, Authorizer authorizer) {
        this.jobs = jobs;
        this.authorizer = authorizer;
    }

    /** 任务清单。 */
    @GetMapping
    public List<String> names() {
        authorizer.platform(Permission.JOB_TRIGGER);
        return jobs.names();
    }

    /** 立刻触发一轮。任务体自身的锁保证同一任务全集群仍只有一个实例在跑。 */
    @PostMapping("/{name}/trigger")
    public ResponseEntity<Triggered> trigger(@PathVariable String name) {
        authorizer.platform(Permission.JOB_TRIGGER);
        ManualJob job = jobs.require(name);
        jobs.triggerAsync(job);
        return ResponseEntity.accepted().body(new Triggered(name));
    }

    public record Triggered(String job) {}
}
