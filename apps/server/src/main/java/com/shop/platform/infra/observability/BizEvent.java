package com.shop.platform.infra.observability;

import java.util.LinkedHashMap;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * 业务事件的唯一出口：字段进 MDC（随 ECS 信封落 JSON）与那行日志一次写完，人读的部分由字段生成。
 *
 * <pre>{@code
 * BizEvent.of("auth.login.failed")
 *         .put("reason", reason)
 *         .put("client_ip", clientIp)
 *         .put("user_id", userId)   // 值为 null 自动跳过，调用点不写 if
 *         .warn();
 * }</pre>
 *
 * <p><b>为什么把 message 也交给它生成</b>：调用方此前要在 MDC 之外再手写一句「人话」，同一批事实被抄第二遍，
 * 于是必然漂移——{@code shop_review.decided} 的字段写 {@code decision=APPROVED}，手写的 message 却打
 * {@code status=TRADING}（那是店铺的营业状态，不是审核决定），读日志的人按 message 理解就错了。生成的
 * message 与结构化字段同源，抄不出第二份也就漂不了；检索与告警仍只认 {@code event}（GEN-48）。
 *
 * <p><b>为什么不留在 {@code try (MdcScope ...) { log.xxx() }} 那种形状</b>：它把「埋字段」和「打这行」拆成
 * 两步，忘了第二步就是一个静默丢失的事件——MDC 里写过了、日志里根本没有，而编译器和测试都不会响。
 * 终止方法（{@link #emit()}/{@link #warn()}/{@link #error()}）不打就写不出完整语句，这个失败模式随之消失。
 *
 * <p>命名规则、必带字段、以及「事件目录与 {@code docs/conventions/business-event-logging.md} 逐条对齐」
 * 由 {@code BusinessEventCatalogTest} 判，这里不校验——日志出口抛异常会把业务请求一起带下去。
 */
public final class BizEvent {

    private static final Logger log = LoggerFactory.getLogger(BizEvent.class);

    private final String event;

    /** 保序：message 里的字段次序即调用点书写次序，读日志时与代码对得上 */
    private final Map<String, String> fields = new LinkedHashMap<>();

    private BizEvent(String event) {
        this.event = event;
    }

    public static BizEvent of(String event) {
        return new BizEvent(event);
    }

    /** 追加一个字段；值为 null 即跳过（条件字段不必在调用点写分支），其余类型按 toString 入表 */
    public BizEvent put(String key, Object value) {
        if (value != null) {
            fields.put(key, String.valueOf(value));
        }
        return this;
    }

    /** 成功/中性事件 */
    public void emit() {
        write(At.INFO, null);
    }

    /** 失败但放行（对账缺口、可容忍降级） */
    public void warn() {
        write(At.WARN, null);
    }

    /** 失败事件 */
    public void error() {
        write(At.ERROR, null);
    }

    /** 失败事件 + 异常栈 */
    public void error(Throwable cause) {
        write(At.ERROR, cause);
    }

    private enum At {
        INFO,
        WARN,
        ERROR
    }

    private void write(At at, Throwable cause) {
        String[] envelope = new String[2 + fields.size() * 2];
        envelope[0] = "event";
        envelope[1] = event;
        int i = 2;
        StringBuilder message = new StringBuilder(event);
        for (Map.Entry<String, String> field : fields.entrySet()) {
            envelope[i++] = field.getKey();
            envelope[i++] = field.getValue();
            message.append(' ').append(field.getKey()).append('=').append(field.getValue());
        }
        try (MdcScope _ = MdcScope.of(envelope)) {
            var line =
                    switch (at) {
                        case INFO -> log.atInfo();
                        case WARN -> log.atWarn();
                        case ERROR -> log.atError();
                    };
            String text = message.toString();
            if (cause == null) {
                line.log(text);
            } else {
                line.setCause(cause).log(text);
            }
        }
    }
}
