package com.shop.platform.testsupport;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import org.slf4j.LoggerFactory;

/**
 * 业务事件捕获（用法同 try-with-resources 的日志作用域）。
 *
 * <p>挂根 logger 而不是被测类自己的 logger：事件一律由 {@code BizEvent} 这一处出口打出，落点 logger
 * 属于实现细节，把它写进断言就等于把「日志从哪个类打出」当成契约钉住，将来换出口会全线误红。
 */
public final class EventCapture implements AutoCloseable {

    private final ListAppender<ILoggingEvent> appender = new ListAppender<>();
    private final Logger root;

    public EventCapture() {
        appender.start();
        root = (Logger) LoggerFactory.getLogger(Logger.ROOT_LOGGER_NAME);
        root.addAppender(appender);
    }

    /** 该事件的那一行；没打出或打出多行都直接失败（一个场景对应一行事件） */
    public ILoggingEvent only(String event) {
        List<ILoggingEvent> hit = eventsOf(event);
        if (hit.size() != 1) {
            throw new AssertionError("期望恰好一条 " + event + "，实际 " + hit.size() + " 条，打出的事件："
                    + appender.list.stream()
                            .map(e -> e.getMDCPropertyMap().get("event"))
                            .toList());
        }
        return hit.getFirst();
    }

    /** 该事件是否打出过（用来钉「这条路径不该有这个事件」） */
    public boolean emitted(String event) {
        return !eventsOf(event).isEmpty();
    }

    /** 捕获期间打出的全部事件名，顺序即打出顺序；空表 = 一行事件都没打（普通日志不算事件） */
    public List<String> names() {
        return appender.list.stream()
                .map(e -> e.getMDCPropertyMap().get("event"))
                .filter(Objects::nonNull)
                .toList();
    }

    /** 该事件落在哪个级别——级别是告警路由的依据，不是随手写的 */
    public String level(String event) {
        return only(event).getLevel().toString();
    }

    public Map<String, String> fields(String event) {
        return only(event).getMDCPropertyMap();
    }

    @Override
    public void close() {
        root.detachAppender(appender);
    }

    private List<ILoggingEvent> eventsOf(String event) {
        // detach 之后 list 仍可读，所以断言放在 try 块外面也成立
        return appender.list.stream()
                .filter(e -> event.equals(e.getMDCPropertyMap().get("event")))
                .toList();
    }
}
