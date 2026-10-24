package com.shop.platform.infra.event;

import com.shop.platform.infra.db.RowMappers;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * 事件登记表的查询与人工放行。查询服务补发任务、指标和管理端清单；
 * 写侧只有一件事——{@link #resetAttempts} 清零重投计数，真正的投递永远归补发任务。
 * 事件本身的落库、标完成全归 Spring Modulith，这里不碰一个字——两处写同一张表必然打架。
 */
@Component
public class EventPublicationStore {

    /**
     * 最老未完成事件的年龄（秒）。这是整条事件链路唯一值得盯的数字：
     * 它一直涨，说明有消费者在持续失败；它归零，说明系统是通的。
     */
    private static final String OLDEST_INCOMPLETE_AGE_SECONDS =
            """
            SELECT COALESCE(EXTRACT(EPOCH FROM (now() - min(publication_date))), 0)
            FROM public.event_publication
            WHERE completion_date IS NULL
            """;

    private static final String COUNT_INCOMPLETE =
            "SELECT count(*) FROM public.event_publication WHERE completion_date IS NULL";

    private final JdbcClient jdbc;

    public EventPublicationStore(JdbcClient jdbc) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
    }

    public double oldestIncompleteAgeSeconds() {
        Number seconds =
                jdbc.sql(OLDEST_INCOMPLETE_AGE_SECONDS).query(Number.class).single();
        return seconds == null ? 0 : seconds.doubleValue();
    }

    public int countIncomplete() {
        Integer count = jdbc.sql(COUNT_INCOMPLETE).query(Integer.class).single();
        return count == null ? 0 : count;
    }

    /** 未完成事件的管理端投影。{@code payloadPreview} 只给报文头 300 字符，够认出是哪笔业务。 */
    public record IncompleteEvent(
            UUID id,
            String listenerId,
            String eventType,
            String payloadPreview,
            Instant publicationDate,
            int completionAttempts,
            Instant lastResubmissionDate) {}

    private static final String FIND_INCOMPLETE =
            """
            SELECT id, listener_id AS listenerId, event_type AS eventType,
                   left(serialized_event, 300) AS payloadPreview,
                   publication_date AS publicationDate,
                   COALESCE(completion_attempts, 0) AS completionAttempts,
                   last_resubmission_date AS lastResubmissionDate
              FROM public.event_publication
             WHERE completion_date IS NULL
             ORDER BY COALESCE(completion_attempts, 0) DESC, publication_date
             LIMIT :limit
            """;

    /** 未完成事件，重投次数多的排前面——超限待人工的天然浮在顶部。 */
    public List<IncompleteEvent> findIncomplete(int limit) {
        return jdbc.sql(FIND_INCOMPLETE)
                .param("limit", limit)
                .query(RowMappers.of(IncompleteEvent.class))
                .list();
    }

    private static final String COUNT_EXHAUSTED =
            """
            SELECT count(*) FROM public.event_publication
             WHERE completion_date IS NULL AND COALESCE(completion_attempts, 0) >= :maxAttempts
            """;

    /** 重投次数已耗尽、等人工放行的事件数。它是「系统需要人」的直接度量。 */
    public int countExhausted(int maxAttempts) {
        Number count = jdbc.sql(COUNT_EXHAUSTED)
                .param("maxAttempts", maxAttempts)
                .query(Number.class)
                .single();
        return count == null ? 0 : count.intValue();
    }

    private static final String RESET_ATTEMPTS =
            """
            UPDATE public.event_publication
               SET completion_attempts = 0
             WHERE id = :id AND completion_date IS NULL
            """;

    /**
     * 清零一条未完成事件的重投计数，让它重新进入补发预算。**投递仍走补发任务唯一通路**，这里不直接投。
     *
     * @return {@code true} 放行成功；{@code false} 事件不存在或已完成（调用方负责区分并给用户可读的错误）
     */
    public boolean resetAttempts(UUID id) {
        return jdbc.sql(RESET_ATTEMPTS).param("id", id).update() == 1;
    }
}
