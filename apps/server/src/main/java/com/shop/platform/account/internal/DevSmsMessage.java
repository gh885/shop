package com.shop.platform.account.internal;

/** 一条「收到」的短信：文案 + 时刻。开发收件箱的条目形状。 */
public record DevSmsMessage(String text, String receivedAt) {}
