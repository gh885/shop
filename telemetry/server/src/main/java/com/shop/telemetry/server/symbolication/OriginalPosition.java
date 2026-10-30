package com.shop.telemetry.server.symbolication;

/**
 * 还原后的原始位置。
 *
 * @param source 原始文件名（通常是 {@code webpack://.../src/...} 或相对路径，原样返回不翻译）
 * @param line 1-based
 * @param column 1-based
 * @param name 压缩前的标识符名（source map 里有 {@code names} 时才有）
 */
public record OriginalPosition(String source, int line, int column, String name) {}
