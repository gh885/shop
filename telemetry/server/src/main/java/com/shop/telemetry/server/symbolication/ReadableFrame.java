package com.shop.telemetry.server.symbolication;

/**
 * 一帧的"人能读"版本。
 *
 * @param file 压缩后的文件（详情页折叠时显示，也是排查"这条 sourcemap 对不对"的依据）
 * @param function 压缩后的函数名；还原出的名字优先
 * @param line 还原后的行号（1-based）；没还原成功时是压缩后的行号
 * @param column 同上
 * @param source 还原出的原始文件；没还原成功时等于 {@code file}
 */
public record ReadableFrame(
        String file, String function, int line, int column, boolean inApp, String source) {

    public boolean resolved() {
        return !source.equals(file);
    }
}
