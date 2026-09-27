package com.shop.platform.common;

import io.micrometer.core.instrument.Metrics;
import java.util.List;
import java.util.function.Function;
import java.util.function.Predicate;
import org.slf4j.Logger;

/**
 * 定时扫描的<b>逐笔隔离</b>：一批里有一笔炸了，只丢那一笔，不丢整批。
 *
 * <p>解决的是一类看不见的停摆：扫描的 SELECT 都按到期时刻升序加 {@code LIMIT} 取头部，所以一笔稳定抛异常的行
 * （外呼挂了、下游数据脏了、某个不变式被历史行违反）会<b>每轮都排在队首</b>。不加隔离时，循环在它这里中断，
 * 后面的行每轮都轮不到——整条超时线被一行卡死，而且不报错：作业还在跑，日志里只有那一笔的堆栈在重复。
 * 注销与售后几处的注释都写着「单笔失败不牵连」，但循环里并没有 try/catch，那句宣称一直是假的（本类把它变成真的）。
 *
 * <p>失败仍然<b>不吞</b>：单笔一行 error 带行标识与堆栈，批次结束补一行 warn 交代「多少笔里失败了几笔」，
 * 于是「这一轮没推进」是能被看见的。下一轮同批重扫就是重试通道，因此这里不需要死信或重试计数。
 *
 * <p>行标识要调用方显式给：实体多是 {@code @Data}，直接把整行塞进日志会连自由文本备注一起落进日志文件
 * （脱敏口径见 GEN-51，而日志一旦落盘就收不回来）。
 */
public final class Sweep {

    private Sweep() {}

    /**
     * 逐笔跑完一批，返回<b>真正落成</b>的笔数。
     *
     * @param label   这一批在日志里的名字（中文业务动作）；出问题时要能一眼看出是哪条超时线
     * @param rows    本批扫到的行，顺序即重试顺序（调用方负责排序与 {@code LIMIT}）
     * @param key     行标识提取器，只用于日志（见类注释里为什么不直接打整行）
     * @param handler 单笔落点，返回 {@code true} 表示这一笔确实改到了；抢不到（人工恰好处理了、
     *                竞态让位）返回 {@code false} 不计入，也不算失败
     */
    public static <T> int each(Logger log, String label, List<T> rows, Function<T, ?> key, Predicate<T> handler) {
        int handled = 0;
        int failed = 0;
        for (T row : rows) {
            try {
                if (handler.test(row)) {
                    handled++;
                }
            } catch (RuntimeException ex) {
                failed++;
                // 计数走 Micrometer 全局注册表（Boot 把自己的注册表挂在上面）：common 不依赖 infra 的 BizEvent，
                // 否则 infra→common 的既有依赖会成环。label 是调用方常量，标签基数有界
                Metrics.counter("shop.sweep.failures", "job", label).increment();
                log.error("[SWEEP] {} 单笔失败，已跳过本笔继续 rest={}", label, key.apply(row), ex);
            }
        }
        if (failed > 0) {
            log.warn("[SWEEP] {} 本批 {} 笔中 {} 笔失败，下一轮重扫这些头部行", label, rows.size(), failed);
        }
        return handled;
    }
}
