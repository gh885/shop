/**
 * trace 视图：把同一 trace_id 的事件拼成一棵跨端调用树。
 *
 * <p>它只读 {@code store}，不写。真正的写入发生在 {@code ingest}（transaction 与 error 都落 event 表），
 * 这里的工作全部是**读取时重建**——和符号化同一个取舍：多一次解析，换来"晚到的数据也能立刻看见"。
 *
 * <p>为什么单独成模块而不是塞进 {@code events}：两者的读模式相反。{@code events} 是"点查一条大对象"，
 * 这里是"按 trace_id 聚一批小对象再做图计算"。混在一起会让"事件详情"这个最热的接口
 * 背上建树的成本。
 */
package com.shop.telemetry.server.trace;
