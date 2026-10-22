package com.shop.platform.infra.event;

import java.util.Objects;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * 事件登记表的只读查询，只服务补发任务和它的指标。
 *
 * <p>写侧全归 Spring Modulith（它负责落库、标完成），这里不碰一个字——两处写同一张表必然打架。
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
}
