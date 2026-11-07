package com.shop.platform.contract;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;

/**
 * 动钱模块「写接口 → 审计覆盖」清单 ⇄ controller 实际端点的双向对拍。
 *
 * <p>堵的是 audit README 点名的缺口：漏调一个审计动作没有任何东西会发现。清单
 * （{@code contracts/audit-coverage.yaml}）给每个写端点一个显式表态——记审计、落域日志、
 * 还是豁免；这个测试保证两边不漂：
 *
 * <ul>
 *   <li>controller 里出现清单没有的写端点 → 红：新写接口必须先表态再合入
 *   <li>清单指向已不存在的端点 → 红：端点删了清单也要删，留着的条目是假答案
 *   <li>{@code audit:} 引用的动作没在 {@code audit.audit_action} 注册 → 红：运行时必炸，提前到门禁
 * </ul>
 *
 * <p>不起 Spring，纯文本扫描（与 {@link DataScopeTest} 同一形态）。只扫六个动钱模块——
 * 其余模块的写接口按约定直接调 {@code AuditEntry}，不在此清单。
 */
class AuditCoverageTest {

    /** 闭环状态表点名的订单/资金/售后侧模块。inventory 没有 controller，留着是给未来加表的人设的闸。 */
    private static final List<String> MONEY_MODULES =
            List.of("trade", "payment", "fulfillment", "returns", "inventory", "clearing");

    private static final Path MANIFEST = Path.of("..", "..", "contracts", "audit-coverage.yaml");

    /** 行格式：{@code - POST /path | coverage | 理由}。 */
    private static final Pattern ENTRY =
            Pattern.compile("^\\s*-\\s*(POST|PUT|PATCH|DELETE)\\s+(\\S+)\\s*\\|\\s*(\\S+)\\s*\\|\\s*(.+?)\\s*$");

    private static final Pattern MAPPING = Pattern.compile("@(Post|Put|Patch|Delete)Mapping\\s*(?:\\(([^)]*)\\))?");

    private static final Path CONTROLLERS = Path.of("src", "main", "java", "com", "shop", "platform");

    @Test
    void 动钱模块的每个写端点都在清单里() throws Exception {
        Set<String> endpoints = endpointsInControllers();
        Set<String> manifest = manifestEntries();

        assertThat(endpoints)
                .as(
                        "这些写端点没有在 contracts/audit-coverage.yaml 表态（记审计 / 落域日志 / 豁免）：新写接口必须先写覆盖决定再合入。%n缺：%s",
                        endpoints.stream().filter(e -> !manifest.contains(e)).toList())
                .allMatch(manifest::contains);

        assertThat(manifest)
                .as(
                        "清单里这些条目指向的端点已不存在：端点删了清单也要删。%n多：%s",
                        manifest.stream().filter(e -> !endpoints.contains(e)).toList())
                .allMatch(endpoints::contains);
    }

    @Test
    void 清单里audit覆盖项引用的动作必须已注册() throws Exception {
        Set<String> registered = AuditActionVocabularyTest.registry();
        Set<String> referenced = new TreeSet<>();
        for (String line : manifestLines()) {
            Matcher matcher = ENTRY.matcher(line);
            if (matcher.matches() && matcher.group(3).startsWith("audit:")) {
                referenced.add(matcher.group(3).substring("audit:".length()));
            }
        }

        assertThat(referenced).as("清单不为空才算核过").isNotEmpty();
        referenced.removeAll(registered);
        assertThat(referenced).as("清单引用了未注册的审计动作，运行时必炸：%n%s", referenced).isEmpty();
    }

    /** 六个动钱模块 controller 的全部写端点，形状 {@code POST /api/buyer/orders}。 */
    private static Set<String> endpointsInControllers() throws IOException {
        Set<String> endpoints = new LinkedHashSet<>();
        for (String module : MONEY_MODULES) {
            Path dir = CONTROLLERS.resolve(module).resolve("controller");
            if (!Files.isDirectory(dir)) {
                continue;
            }
            try (Stream<Path> files = Files.list(dir)) {
                for (Path file :
                        files.filter(path -> path.toString().endsWith(".java")).toList()) {
                    String source =
                            Files.readString(file, StandardCharsets.UTF_8).replace("\r", "");
                    endpoints.addAll(endpointsOf(source));
                }
            }
        }
        assertThat(endpoints).as("六个动钱模块一个写端点都没扫到，扫描口径和 controller 写法对不上了").isNotEmpty();
        return endpoints;
    }

    private static Set<String> endpointsOf(String source) {
        Set<String> endpoints = new LinkedHashSet<>();
        Matcher base = Pattern.compile("@RequestMapping\\s*\\(\\s*\"([^\"]+)\"").matcher(source);
        String basePath = base.find() ? base.group(1) : "";
        Matcher mappings = MAPPING.matcher(source);
        while (mappings.find()) {
            String suffix = mappingPath(mappings.group(2));
            endpoints.add(mappings.group(1).toUpperCase() + " " + basePath + suffix);
        }
        return endpoints;
    }

    /** @PostMapping 无参 → 空后缀；@PostMapping("/{id}/refund") → 取第一个引号串。 */
    private static String mappingPath(String args) {
        if (args == null || args.isBlank()) {
            return "";
        }
        Matcher value = Pattern.compile("\"([^\"]+)\"").matcher(args);
        return value.find() ? value.group(1) : "";
    }

    private static List<String> manifestLines() throws IOException {
        assertThat(MANIFEST).as("清单要相对 apps/server 解析；找不到说明目录结构变了").exists();
        return Files.readAllLines(MANIFEST, StandardCharsets.UTF_8).stream()
                .filter(line -> line.strip().startsWith("- "))
                .toList();
    }

    private static Set<String> manifestEntries() throws IOException {
        Set<String> entries = new TreeSet<>();
        for (String line : manifestLines()) {
            Matcher matcher = ENTRY.matcher(line);
            assertThat(matcher.matches())
                    .as("清单行格式不对（应为 `- METHOD path | coverage | 理由`）：%s", line.strip())
                    .isTrue();
            entries.add(matcher.group(1) + " " + matcher.group(2));
        }
        return entries;
    }
}
