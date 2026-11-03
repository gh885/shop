package com.shop.platform.infra.security;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * 这个端点**故意不判权**：登录、刷新、注册、公开浏览这类匿名可达的入口。
 *
 * <p>标记本身什么都不做，它只给 {@code AuthorizationCoverageTest} 看。存在的理由：源码扫描没法
 * 区分"忘了判权"和"本来就不该判权"，这两者长得一模一样。白名单救不了——白名单在文件里，
 * 只要控制器整体进了名单，之后往里加一个能改数据的端点也会跟着豁免；标记在端点上，
 * 新加的端点不会继承任何豁免。
 *
 * <p><b>加这个标记等于在 code review 里当众说"这里谁都能打"。</b>别拿它当"暂时先这样"。
 */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.SOURCE)
public @interface Public {}
