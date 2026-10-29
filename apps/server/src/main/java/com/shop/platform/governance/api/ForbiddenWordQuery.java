package com.shop.platform.governance.api;

import java.util.Optional;

/**
 * 公开文本的违禁词检查。catalog 在提交 / 非草稿编辑时调用。
 *
 * <p>只回答「命中了哪个词」，不负责改写文本、不负责决定字段怎么标红——
 * 那是调用方的错误响应形状。
 */
public interface ForbiddenWordQuery {

    /** 命中词（已归一化），没有命中返回空。 */
    Optional<String> firstHit(String text);
}
