package com.shop.telemetry.sdk.spring;

import com.shop.telemetry.sdk.TraceContext;
import com.shop.telemetry.sdk.TraceHeaders;
import io.sentry.ITransaction;
import io.sentry.Sentry;
import io.sentry.SpanId;
import io.sentry.SpanStatus;
import io.sentry.TracesSamplingDecision;
import io.sentry.TransactionContext;
import io.sentry.TransactionOptions;
import io.sentry.protocol.SentryId;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.concurrent.ThreadLocalRandom;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * 挂载点 1/5：请求级 scope、链路头、以及**本进程的 transaction**。
 *
 * <p>做四件事，且都不含业务判断：
 *
 * <ol>
 *   <li>入站：解析 {@code sentry-trace}/{@code baggage}；有上游决策就继承，没有才自己掷骰子
 *   <li>开事务：span_id **就用回写头里那个**——下游看到的父节点必须等于事务本身，
 *       否则树会分裂成两棵（这是手写链路实现最常见的错）
 *   <li>进出：{@code trace_id}/{@code span_id} 进 MDC（日志平台的唯一锚点）
 *   <li>出站：回写 {@code sentry-trace}；>=500 把错误交给出口（4xx 是业务结果，不是故障）
 * </ol>
 *
 * <p>采样决策只在**链路最上游**做一次：浏览器带了 {@code sentry-sampled=1} 就强制采，
 * 并把决策原样传给下游。各节点独立掷骰子的后果是"上游采了、下游没采"，得到一棵缺半边的树，
 * 比没有树更难查。
 */
@Order(Ordered.HIGHEST_PRECEDENCE + 100)
public class TelemetryWebFilter extends OncePerRequestFilter {

    /** 让下游（Controller / 业务代码）拿到同一个上下文，不用重新解析头。 */
    public static final String TRACE_ATTRIBUTE = TraceContext.class.getName();

    private static final String MDC_TRACE_ID = "trace_id";
    private static final String MDC_SPAN_ID = "span_id";

    private final TelemetryErrorReporter reporter;
    private final String publicKey;
    private final double tracesSampleRate;

    public TelemetryWebFilter(TelemetryErrorReporter reporter, String publicKey, double tracesSampleRate) {
        this.reporter = reporter;
        this.publicKey = publicKey;
        this.tracesSampleRate = tracesSampleRate;
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        TraceContext context = TraceHeaders.inbound(
                request.getHeader(TraceHeaders.SENTRY_TRACE),
                request.getHeader(TraceHeaders.BAGGAGE),
                publicKey,
                roll(tracesSampleRate));
        request.setAttribute(TRACE_ATTRIBUTE, context);
        MDC.put(MDC_TRACE_ID, context.traceId());
        MDC.put(MDC_SPAN_ID, context.spanId());

        // 没采到就根本没有事务：连 NoOp 都不建，省掉一次「采样决策 true 但本层不该采」的误伤
        ITransaction transaction = context.sampled() ? startTransaction(context) : null;
        TelemetryTrace.attach(transaction);

        Throwable failure = null;
        try {
            chain.doFilter(request, response);
        } catch (ServletException | IOException | RuntimeException e) {
            failure = e;
            throw e;
        } finally {
            try {
                if (transaction != null) {
                    finish(transaction, request, response);
                }
                // 已提交的响应（SSE / 流式 SSR）这里改不动，是已知限制，不是 bug
                response.setHeader(TraceHeaders.SENTRY_TRACE, TraceHeaders.toSentryTrace(context));
                if (failure != null || response.getStatus() >= 500) {
                    captureQuietly(request, failure, response.getStatus());
                }
            } finally {
                TelemetryTrace.detach();
                MDC.remove(MDC_TRACE_ID);
                MDC.remove(MDC_SPAN_ID);
            }
        }
    }

    private ITransaction startTransaction(TraceContext context) {
        TransactionContext transactionContext = new TransactionContext(
                new SentryId(context.traceId()),
                new SpanId(context.spanId()),
                context.parentSpanId() == null ? null : new SpanId(context.parentSpanId()),
                // 决策已经定了，SDK 只负责如实上报（sample_rate 也照实写，不看配置）
                new TracesSamplingDecision(true, tracesSampleRate),
                null);
        // SDK 默认 op 是 "default"，那在 span 树里没有信息量；后端事务就是 http.server
        transactionContext.setOperation("http.server");
        return Sentry.startTransaction(transactionContext, new TransactionOptions());
    }

    private void finish(ITransaction transaction, HttpServletRequest request, HttpServletResponse response) {
        // 事务名用**路由模板**：拿原始路径会让每个订单 id 变成一条独立事务，索引和界面立刻失控
        transaction.setName(RouteTemplates.of(request));
        transaction.setData("http.response.status_code", response.getStatus());
        transaction.setStatus(SpanStatus.fromHttpStatusCode(response.getStatus()));
        transaction.finish();
    }

    /** 上游给了决策就继承；没给才掷。返回的是"本层的决策"，不是"上游的决策"。 */
    private static boolean roll(double rate) {
        if (rate <= 0.0) {
            return false;
        }
        if (rate >= 1.0) {
            return true;
        }
        return ThreadLocalRandom.current().nextDouble() < rate;
    }

    /** 采集链路自己绝不能把业务请求打挂，所以这里吞掉并记一笔。 */
    private void captureQuietly(HttpServletRequest request, Throwable failure, int status) {
        try {
            reporter.capture(request, failure, status);
        } catch (RuntimeException e) {
            logger.warn("telemetry reporter 失败，已忽略", e);
        }
    }
}
