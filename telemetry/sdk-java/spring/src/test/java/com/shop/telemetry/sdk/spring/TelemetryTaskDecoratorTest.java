package com.shop.telemetry.sdk.spring;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;

import io.sentry.ITransaction;
import io.sentry.Sentry;
import io.sentry.SentryOptions;
import io.sentry.Span;
import io.sentry.SpanId;
import io.sentry.TracesSamplingDecision;
import io.sentry.TransactionContext;
import io.sentry.TransactionOptions;
import io.sentry.protocol.SentryId;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * 异步挂载点：span 必须跟着任务过线程边界。
 *
 * <p>这里验**最核心的一句话**：在别的线程里开的子 span，父节点仍然是提交线程那个。
 * 断言直接看事务的 {@code getSpans()}，不需要假 relay——协议层已经被别的测试覆盖，
 * 这一层的问题（断链）只体现在树的形状上。
 *
 * <p>事务必须由**真 Hub** 造（{@code NoOpHub} 的 {@code getSpans()} 永远是空的，断言会假通过）。
 * DSN 指向一个不存在的端口、且用例从不 {@code finish()}，所以一次网络请求都不会发出。
 */
class TelemetryTaskDecoratorTest {

    private static final String TRACE_ID = "7c9e6679b1a24a3f8e5d0c1b2a394857";

    @BeforeEach
    void initHub() {
        SentryOptions options = new SentryOptions();
        options.setDsn("http://dev-key@127.0.0.1:1/1");
        options.setTracesSampleRate(1.0);
        Sentry.init(options);
    }

    @AfterEach
    void closeHub() {
        Sentry.close();
    }

    /** 没有事务时连 wrapper 都不加：装饰一次的开销必须为零。 */
    @Test
    void returnsSameRunnableWhenNothingToCarry() {
        Runnable body = () -> {};

        assertSame(body, new TelemetryTaskDecorator().decorate(body));
    }

    @Test
    void carriesCurrentSpanIntoWorkerThread() throws Exception {
        ITransaction transaction = transaction();
        TelemetryTrace.attach(transaction);
        try {
            Runnable decorated = new TelemetryTaskDecorator().decorate(
                    () -> TelemetryTrace.inSpan("db.select", "SELECT 1", () -> null));
            Thread worker = new Thread(decorated, "telemetry-worker");
            worker.start();
            worker.join();
        } finally {
            TelemetryTrace.detach();
        }

        assertEquals(1, transaction.getSpans().size(), "异步任务里的 span 必须真的被创建");
        Span child = transaction.getSpans().getFirst();
        assertEquals(
                transaction.getSpanContext().getSpanId(),
                child.getSpanContext().getParentSpanId(),
                "父节点必须是提交线程的事务，否则树上多一截孤儿");
        assertEquals("db.select", child.getOperation());
    }

    /** 线程池会复用线程：跑完要把线程原来的状态还回去，不然下一个任务会认错父亲。 */
    @Test
    void restoresPreviousSpanAfterTask() throws Exception {
        ITransaction outer = transaction();
        ITransaction inner = transaction();
        AtomicReference<Object> afterRun = new AtomicReference<>();
        TelemetryTrace.attach(outer);
        try {
            Runnable decorated = new TelemetryTaskDecorator().decorate(() -> {});
            Thread worker = new Thread(() -> {
                TelemetryTrace.attach(inner); // 这个线程上本来就有别的请求的 span
                decorated.run();
                afterRun.set(TelemetryTrace.current());
                TelemetryTrace.detach();
            });
            worker.start();
            worker.join();
        } finally {
            TelemetryTrace.detach();
        }

        assertSame(inner, afterRun.get(), "任务结束后必须还原线程原来的 span");
    }

    @Test
    void keepsSubmitterSideSpanAfterDecorate() {
        ITransaction transaction = transaction();
        TelemetryTrace.attach(transaction);
        try {
            new TelemetryTaskDecorator().decorate(() -> {});
            assertSame(transaction, TelemetryTrace.current(), "装饰动作本身不能改动提交线程的状态");
        } finally {
            TelemetryTrace.detach();
        }
    }

    private static ITransaction transaction() {
        TransactionContext context = new TransactionContext(
                new SentryId(TRACE_ID),
                new SpanId(randomSpanId()),
                null,
                new TracesSamplingDecision(true, 1.0),
                null);
        context.setOperation("http.server");
        return Sentry.startTransaction(context, new TransactionOptions());
    }

    private static String randomSpanId() {
        return UUID.randomUUID().toString().replace("-", "").substring(0, 16);
    }
}
