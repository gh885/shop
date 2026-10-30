package com.shop.telemetry.server.symbolication;

import java.util.List;

/**
 * 详情页要展示的栈 + 符号化状态。
 *
 * <p>frames 顺序保持 Sentry 原样（最旧在前）——很多前端习惯"最新在最前"，翻转放在展示层做，
 * 否则两边各翻一次就永远对不上。
 */
public record SymbolicatedStack(SymbolicationStatus status, List<ReadableFrame> frames) {}
