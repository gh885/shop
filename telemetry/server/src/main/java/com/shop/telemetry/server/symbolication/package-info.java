/**
 * 符号化：把"压缩后的位置"还原成"原始文件:行:列"。
 *
 * <p>自成一个模块、**不依赖 store**：sourcemap 是"配置类"数据（按 debug_id 点查，量小），
 * 和事件流的访问模式完全不同，混在一起会让 store 变成一个什么都懂的上帝模块。
 *
 * <p>M0 只处理前端（sourcemap）。Java 栈自带类名与行号，只有做 jar 混淆才需要 source bundle,
 * 那时在 {@code internal} 里加一个策略，接口 {@code StackReader} 不变。
 */
package com.shop.telemetry.server.symbolication;
