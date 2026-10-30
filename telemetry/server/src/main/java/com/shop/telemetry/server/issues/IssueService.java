package com.shop.telemetry.server.issues;

import com.shop.telemetry.server.issues.internal.JdbcIssueRepository;
import java.util.List;
import java.util.Optional;
import org.springframework.stereotype.Component;

/**
 * issue 模块对外的唯一入口（modulith：根包里的类才是别的模块能用的）。
 *
 * <p>写入方法必须由调用方的事务包住（{@code ingest} 用 TransactionTemplate 把
 * "event 插入 → issue upsert → 回填关联"做成一个原子步），这里刻意不加 {@code @Transactional}：
 * 事务边界属于"一次 ingest 的原子性"，不属于 issue 自己的职责。
 */
@Component
public class IssueService {

    private static final int MAX_LIMIT = 200;

    private final JdbcIssueRepository repository;

    IssueService(JdbcIssueRepository repository) {
        this.repository = repository;
    }

    /** 建或更新一条 issue，返回 id。只在 event 首次插入成功后调用。 */
    public long record(IssueEvent event) {
        return repository.upsert(event);
    }

    public List<IssueSummary> list(String projectId, int limit) {
        return repository.list(projectId, Math.clamp(limit, 1, MAX_LIMIT));
    }

    public Optional<IssueSummary> find(String projectId, long id) {
        return repository.find(projectId, id);
    }
}
