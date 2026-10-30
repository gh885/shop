package com.shop.telemetry.server.grouping;

/**
 * 分组算法。
 *
 * <p>两个硬约束：
 *
 * <ol>
 *   <li>**纯函数**：同样的输入必须永远得到同样的 fingerprint。它唯一的消费方不只 ingest，
 *       还有"重新分组"的离线工具——两者必须调同一个实现，否则改算法就等于制造两套历史。
 *   <li>**可覆盖**：客户端给的 fingerprint 优先。默认智能 + 留逃生口，是 issue 聚合能不
 *       被算法缺陷搞死的唯一办法。
 * </ol>
 */
public interface Fingerprinter {

    String fingerprint(FingerprintInput input);
}
