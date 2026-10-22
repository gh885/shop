package com.shop.platform;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.modulith.core.ApplicationModules;

/**
 * Spring Modulith 自己的结构校验。
 *
 * <p>为什么需要这个测试：{@link ArchitectureTest} 拦的是我们自己写的规则（原生 SQL 只住四类包、不引 ORM、
 * 子包白名单），而 <b>Modulith 那一套约束从来没被检查过</b>——{@code ApplicationModules.verify()}
 * 一次都没被调用。于是「模块 A 引用了模块 B 未暴露的类型」这类违规只会在 IDE 插件里报，
 * 命令行跑绿，CI 也绿。
 *
 * <p>实测踩到的一次：{@code common} 没有 {@code package-info.java}，Modulith 把它当成一个封闭模块，
 * 任何模块引用 {@code common.money.Money} 都是"引用未暴露类型"。IDE 一片红，{@code mvn test} 全绿。
 * 根因是 {@code common} / {@code infra} 在架构上是共享包而不是模块，得用 {@code Type.OPEN} 说出来。
 *
 * <p>只分析 {@code src/main}，与 {@link ArchitectureTest} 同一口径。
 */
class ModularityTest {

    private static final ApplicationModules MODULES = ApplicationModules.of(ShopServerApplication.class);

    /**
     * 模块边界、命名接口、允许的依赖方向——全部交给 Modulith 判。
     *
     * <p>失败时它会指出具体是哪一行代码越界（哪个类引用了哪个模块的哪个类型），
     * 比我们自己写 ArchUnit 规则准确：它读的是 {@code @ApplicationModule} 和 {@code @NamedInterface}，
     * 而那是模块边界的唯一声明处。
     */
    @Test
    void moduleBoundariesAreRespected() {
        MODULES.verify();
    }

    /**
     * 共享包必须是 OPEN 类型。
     *
     * <p>这条单独钉住，是因为它最容易被误删：{@code package-info.java} 删掉不会编译失败，
     * 只会让所有模块的引用在 IDE 里变红、而命令行照旧绿。上面那个 {@code verify()} 能抓到，
     * 但报错是"引用了未暴露类型"，不容易一眼看出该去补 {@code Type.OPEN}。
     */
    @Test
    void sharedPackagesAreOpen() {
        assertThat(MODULES.getModuleByName("common"))
                .as("common 必须存在且是 OPEN——它是共享包，不是业务模块")
                .hasValueSatisfying(module -> assertThat(module.isOpen())
                        .as("common 是共享包，必须 Type.OPEN，否则所有模块引用 common.money.Money 都算越界")
                        .isTrue());
        assertThat(MODULES.getModuleByName("infra"))
                .as("infra 必须存在且是 OPEN——它是共享包，不是业务模块")
                .hasValueSatisfying(module -> assertThat(module.isOpen())
                        .as("infra 是共享包，必须 Type.OPEN，否则所有模块引用 infra 里的东西都算越界")
                        .isTrue());
    }
}
