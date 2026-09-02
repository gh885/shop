package com.shop.platform;

import static org.assertj.core.api.Assertions.assertThat;

import com.tngtech.archunit.core.domain.JavaMethodCall;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * Locale 安全性回归：禁止无参 {@code String.toLowerCase()/toUpperCase()}。
 *
 * <p>无参重载吃 JVM 默认 Locale：在 tr-TR 区域下 {@code "i".toUpperCase()} = {@code "İ"}、
 * {@code "I".toLowerCase()} = {@code "ı"}。本服务曾四处带病——验证码校验（tr-TR 下带 i/I 的验证码
 * 永远失败）、{@link com.shop.platform.common.Money} 币种规范化（{@code "cny"} 不等于 {@code "CNY"}，
 * 跨币种护栏形同虚设）、图片扩展名白名单、密码黑名单比对。这类 bug 只在你部署到某个区域机器上时
 * 静默炸，本地永不复现。一律改用 {@code Locale.ROOT} 重载。
 */
class LocaleSafetyTest {

    @Test
    void 无参大小写转换_全站禁止() {
        List<String> violations = new ArrayList<>();
        new ClassFileImporter()
                .withImportOption(new ImportOption.DoNotIncludeTests()).importPackages("com.shop.platform").stream()
                        .forEach(clazz -> clazz.getMethods().forEach(method -> method.getMethodCallsFromSelf().stream()
                                .filter(LocaleSafetyTest::isUnsafe)
                                .forEach(call -> violations.add(method.getFullName() + " 调用了无参 "
                                        + call.getTarget().getName() + "()，必须改用 Locale.ROOT 重载"))));
        assertThat(violations).as("Locale 不安全的大小写转换").isEmpty();
    }

    private static boolean isUnsafe(JavaMethodCall call) {
        String name = call.getTarget().getName();
        return (name.equals("toLowerCase") || name.equals("toUpperCase"))
                && call.getTarget().getParameterTypes().isEmpty();
    }

    /** 正例锚点：带 Locale.ROOT 的调用不违规，防规则误伤。 */
    @SuppressWarnings("unused")
    private static String anchor() {
        return "A".toLowerCase(java.util.Locale.ROOT);
    }
}
