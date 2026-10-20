package com.shop.platform.infra.security;

/**
 * 没有身份、没有权限、或者越权访问了不属于自己的店铺。
 *
 * <p>三种情况刻意不区分对外信息：调用方只需要知道"不行"。区别写在日志里，不写进响应。
 */
public class ForbiddenException extends RuntimeException {

    public ForbiddenException(String message) {
        super(message);
    }

    public static ForbiddenException noOperator() {
        return new ForbiddenException("没有操作人上下文，请求未认证");
    }
}
