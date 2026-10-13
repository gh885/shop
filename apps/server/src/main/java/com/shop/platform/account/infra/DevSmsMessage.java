package com.shop.platform.account.infra;

/**
 * 开发态虚拟收件箱里的一条「短信」——真实通道发什么文案就存什么（含用途前缀），
 * 所以收件箱看到的与手机收到的逐字一致。只在开发环境存在（{@link DevSmsChannel} 条件装配）。
 *
 * @param text 短信文案（如「重置密码验证码: 123456」）
 * @param sentAt 发送时刻（ISO-8601 字符串，仅展示用）
 */
public record DevSmsMessage(String text, String sentAt) {}
