package com.shop.platform;

import static org.assertj.core.api.Assertions.assertThat;

import com.shop.platform.testsupport.SourceScanner;
import java.io.IOException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;

/**
 * 门禁：有第二个写者的列，实体上必须标 {@code updateStrategy = FieldStrategy.NEVER}（docs/adr/0001 代价 6 的升级版）。
 *
 * <p>坑的形状只有一种：service 读出整行、改几个字段、{@code updateById} 整行回写，而同一行的某一列此刻正被另一条
 * <b>条件更新</b>改——回写把打开页面时读到的旧值写回去，别人的处置就静默消失。Product.status（卖家编辑撞上平台下架）
 * 是第一次，ShopMember.status（店主调权限撞上对方确认邀请）是第二次，两次都是审视时才抓到、没有任何测试会红。
 * 0001 写着「再出现一次就升级成门禁」，这就是那道门禁。
 *
 * <p>判据两问，都从源码里读：
 *
 * <ol>
 *   <li><b>这个实体有没有整行回写</b>：全库搜 {@code xxxMapper.updateById(}，经 {@code interface XxxMapper extends
 *       BaseMapper<E>} 解析到实体 E。没有整行回写的实体不在本门禁范围（它们的列没有可被覆盖的路径）。
 *   <li><b>E 的哪些列有第二个写者</b>：① 转移列——某条 wrapper 语句里同一列既在 {@code .eq / .in / .ne} 守卫里、
 *       又在 {@code .set} 里（{@code WHERE status = X SET status = Y}）；② 累加列——本实体 Mapper 文件的 SQL 里
 *       {@code x = … x ± …}（{@code sold_count = sold_count + n}、{@code LEAST(c.quantity + …)}）。
 * </ol>
 *
 * 两边都命中的列必须 NEVER。wrapper 与裸 SQL 不受字段策略影响，所以 NEVER 不会碰坏任何一条条件更新，也不影响插入。
 *
 * <p>刻意不管的：同一主体的普通编辑互相撞车（SKU 的 {@code updateByProductAndId} 与 {@code updateById} 都是卖家在编辑，
 * last-writer-wins 是 0001 接受的 CRUD 常态）；带 {@code @Version} 的实体（整行回写自己带乐观闸门，0 行即 409）；
 * 基类的 id / createdAt / updatedAt。裸 SQL 只解析本实体 Mapper 文件里的，api 包里的跨 schema 语句由 review 维持；
 * 累加形状认 {@code x = x ± n} 与 {@code LEAST(x + n, …)}，被 {@code COALESCE} 包起来的不认（今天只有 orders 这么写，
 * 而 Order 没有整行回写）。
 */
class SecondWriterColumnGateTest {

    private static final Path MAIN_JAVA = SourceScanner.MAIN_JAVA;

    private static final Pattern MAPPER_DECL =
            Pattern.compile("interface\\s+(\\w+Mapper)\\s+extends\\s+BaseMapper<(\\w+)>");

    /** 整行回写调用点：接收者是个变量名，类型要回同文件的声明里解析（商家地址 service 的 addressMapper 指向的是 MerchantAddressMapper） */
    private static final Pattern UPDATE_BY_ID = Pattern.compile("\\b(\\w+)\\.updateById\\s*\\(");

    /** 基类列：两种写路径都写它们是设计使然，不算第二写者 */
    private static final Set<String> BASE_FIELDS = Set.of("id", "createdAt", "updatedAt");

    /**
     * 累加形状：列名 = … 同名列 ± …。排除 {@code #{col}} 占位（前一个字符是 {@code {}）与 {@code EXCLUDED.col}
     * （upsert 的入行，不是旧值）；表别名限定（{@code c.quantity}）照认。扫描停在逗号 / 分号 / WHERE，不跨 SET 项。
     */
    private static final Pattern ACCUMULATE = Pattern.compile(
            "\\b([a-z][a-z0-9_]*)\\s*=\\s*(?:(?![,;]|\\bWHERE\\b).)*?(?<!EXCLUDED\\.)(?<!\\{)\\b\\1\\b\\s*[+-]",
            Pattern.DOTALL);

    /** Java 字符串拼接：把 {@code "…" + "…"} 接回一段，让跨段的 SQL 在正则眼里连续 */
    private static final Pattern STRING_CONCAT = Pattern.compile("\"\\s*\\+\\s*\"");

    private record Flag(String field, String why) {}

    @Test
    void 有第二个写者的列必须标NEVER() throws IOException {
        Map<Path, String> sources = new LinkedHashMap<>();
        for (Path file : SourceScanner.javaFiles(MAIN_JAVA)) {
            sources.put(file, SourceScanner.withoutComments(SourceScanner.read(file)));
        }

        // 1. mapper 接口 → 实体
        Map<String, String> entityOfMapper = new HashMap<>();
        Map<String, List<Path>> mapperFilesOfEntity = new HashMap<>();
        for (Map.Entry<Path, String> entry : sources.entrySet()) {
            Matcher m = MAPPER_DECL.matcher(entry.getValue());
            while (m.find()) {
                entityOfMapper.put(m.group(1), m.group(2));
                mapperFilesOfEntity
                        .computeIfAbsent(m.group(2), k -> new ArrayList<>())
                        .add(entry.getKey());
            }
        }

        // 2. 有整行回写的实体：认不出接收者是哪个 mapper 就当违规，别静默漏检
        Set<String> written = new TreeSet<>();
        List<String> unknown = new ArrayList<>();
        for (Map.Entry<Path, String> entry : sources.entrySet()) {
            Matcher m = UPDATE_BY_ID.matcher(entry.getValue());
            while (m.find()) {
                String mapperType = declaredMapperType(entry.getValue(), m.group(1));
                String entity = mapperType == null ? null : entityOfMapper.get(mapperType);
                if (entity == null) {
                    unknown.add(SourceScanner.rel(MAIN_JAVA, entry.getKey()) + " → " + m.group(1));
                } else {
                    written.add(entity);
                }
            }
        }
        assertThat(unknown)
                .as("updateById 的接收者必须能解析到 BaseMapper<实体>；认不出就是门禁瞎了，宁可假红")
                .isEmpty();

        // 3. 逐实体找第二写者列，核对 NEVER
        List<String> violations = new ArrayList<>();
        Set<String> flagged = new TreeSet<>();
        Set<String> versioned = new TreeSet<>();
        for (String entity : written) {
            Path entityFile = entityFile(sources, entity);
            String entitySource = sources.get(entityFile);
            if (entitySource.contains("@Version")) {
                versioned.add(entity);
                continue;
            }
            Set<Flag> flags = new LinkedHashSet<>();
            flags.addAll(transitionColumns(sources, entity));
            flags.addAll(
                    accumulatedColumns(sources, mapperFilesOfEntity.getOrDefault(entity, List.of()), entitySource));
            for (Flag flag : flags) {
                if (BASE_FIELDS.contains(flag.field())) {
                    continue;
                }
                flagged.add(entity + "." + flag.field());
                if (!hasNever(entitySource, flag.field())) {
                    violations.add(entity + "." + flag.field() + "（" + flag.why() + "）");
                }
            }
        }

        assertThat(violations)
                .as("这些列有第二个写者，而实体又有 updateById 整行回写：回写会把读到的旧值写回、撤销别人的处置。"
                        + "给字段加 @TableField(updateStrategy = FieldStrategy.NEVER)，状态流转一律走 mapper 条件更新")
                .isEmpty();

        // 4. 反证不空转：已知样本必须被扫到，扫不到说明口径坏了而不是规则被遵守
        assertThat(flagged)
                .as("Product.status（转移列）与 Product.soldCount（累加列）是这道门禁的标定样本")
                .contains("Product.status", "Product.soldCount", "ShopMember.status", "Payment.status");
        assertThat(versioned).as("SkuStock.setTotal 走 @Version 乐观锁，是刻意的豁免样本").contains("SkuStock");
    }

    /** 变量的声明类型：同文件里 {@code XxxMapper 变量名} 的那一处（字段或形参），找不到回 null */
    private static String declaredMapperType(String source, String variable) {
        Matcher m = Pattern.compile("\\b(\\w+Mapper)\\s+" + Pattern.quote(variable) + "\\b")
                .matcher(source);
        return m.find() ? m.group(1) : null;
    }

    /** 实体源码：按文件名在 mapper 包里找；找不到或找到多个都直接炸——门禁不猜 */
    private static Path entityFile(Map<Path, String> sources, String entity) {
        List<Path> hits = new ArrayList<>();
        for (Path file : sources.keySet()) {
            if (file.getFileName().toString().equals(entity + ".java")
                    && "mapper".equals(file.getParent().getFileName().toString())) {
                hits.add(file);
            }
        }
        assertThat(hits).as("实体 %s 的源码应当唯一地住在某个 mapper 包里", entity).hasSize(1);
        return hits.getFirst();
    }

    /** 转移列：同一条 wrapper 语句里既做守卫（eq / in / ne）又被 set 的列 */
    private static Set<Flag> transitionColumns(Map<Path, String> sources, String entity) {
        Pattern guard = Pattern.compile(
                "\\.(?:eq|in|ne)\\((?:(?!\\.(?:eq|in|ne|set)\\().)*?\\b" + entity + "::get(\\w+)", Pattern.DOTALL);
        Pattern set = Pattern.compile(
                "\\.set\\((?:(?!\\.(?:eq|in|ne|set)\\().)*?\\b" + entity + "::get(\\w+)", Pattern.DOTALL);
        Set<Flag> flags = new LinkedHashSet<>();
        for (Map.Entry<Path, String> entry : sources.entrySet()) {
            if (!entry.getValue().contains(entity + "::get")) {
                continue;
            }
            for (String statement : entry.getValue().split(";")) {
                if (!statement.contains(".set(")) {
                    continue;
                }
                Set<String> guarded = fields(guard, statement);
                for (String field : fields(set, statement)) {
                    if (guarded.contains(field)) {
                        flags.add(new Flag(
                                field, "转移列：WHERE 守卫与 SET 是同一列，" + SourceScanner.rel(MAIN_JAVA, entry.getKey())));
                    }
                }
            }
        }
        return flags;
    }

    /** 累加列：本实体 Mapper 文件的 SQL 里 {@code x = … x ± …}，列名转成实体字段名后必须真是该实体的字段 */
    private static Set<Flag> accumulatedColumns(
            Map<Path, String> sources, List<Path> mapperFiles, String entitySource) {
        Set<Flag> flags = new LinkedHashSet<>();
        for (Path mapperFile : mapperFiles) {
            String joined = STRING_CONCAT.matcher(sources.get(mapperFile)).replaceAll("");
            Matcher m = ACCUMULATE.matcher(joined);
            while (m.find()) {
                String field = camel(m.group(1));
                if (declaresField(entitySource, field)) {
                    flags.add(new Flag(field, "累加列：SET x = x ± n，" + SourceScanner.rel(MAIN_JAVA, mapperFile)));
                }
            }
        }
        return flags;
    }

    private static Set<String> fields(Pattern pattern, String statement) {
        Set<String> out = new LinkedHashSet<>();
        Matcher m = pattern.matcher(statement);
        while (m.find()) {
            out.add(decapitalize(m.group(1)));
        }
        return out;
    }

    private static boolean declaresField(String entitySource, String field) {
        return Pattern.compile("\\bprivate\\s+[\\w.<>?,\\s]+?\\s+" + field + "\\s*;")
                .matcher(entitySource)
                .find();
    }

    /** 注解与字段声明之间不许隔着分号：保证 NEVER 真的贴在这个字段上，而不是上一个字段的 */
    private static boolean hasNever(String entitySource, String field) {
        return Pattern.compile(
                        "updateStrategy\\s*=\\s*FieldStrategy\\.NEVER[^;]*?\\bprivate\\b[^;]*?\\b" + field + "\\s*;",
                        Pattern.DOTALL)
                .matcher(entitySource)
                .find();
    }

    private static String decapitalize(String s) {
        return Character.toLowerCase(s.charAt(0)) + s.substring(1);
    }

    private static String camel(String snake) {
        StringBuilder out = new StringBuilder();
        boolean upper = false;
        for (char c : snake.toCharArray()) {
            if (c == '_') {
                upper = true;
            } else {
                out.append(upper ? Character.toUpperCase(c) : c);
                upper = false;
            }
        }
        return out.toString();
    }
}
