package com.shop.platform.contract;

import static org.assertj.core.api.Assertions.assertThat;

import com.shop.platform.infra.db.ShopTenantHandler;
import com.shop.platform.testsupport.SourceScanner;
import java.io.IOException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

/**
 * 商家数据隔离的清单一致性门禁：{@link ShopTenantHandler} 的表清单、V91 的 policy、以及真实库里的
 * {@code shop_id} 列三者必须对齐。
 *
 * <p>为什么需要这条：三份清单各自演化时，漂移是静默的——新加一张带 {@code shop_id} 的表却忘了登记，
 * 租户插件不会报错（它只是不管那张表），RLS 也不会报错（没有 policy 就等于不过滤）。结果是一张
 * 完全不受隔离的表，而所有测试照绿。这条门禁把「忘了」变成「红」。
 *
 * <p>它扫的是源码与迁移脚本，不连库——所以能在 {@code mvn test -Dgroups=contract} 里提前跑，
 * 不依赖数据面。真实库的比对由 {@code TenantIsolationIT} 承担（那一条需要库）。
 */
@Tag("contract")
class TenantTableVocabularyTest {

    private static final Path MIGRATION_DIR = Path.of("src", "main", "resources", "db", "migration");

    /** V91 里 tenant_tables 数组的字面量 */
    private static final Pattern MIGRATION_LIST =
            Pattern.compile("tenant_tables\\s+text\\[\\]\\s*:=\\s*ARRAY\\[(.*?)]", Pattern.DOTALL);

    /** 迁移脚本里 CREATE TABLE 后紧跟的列定义块（只取到第一个右括号为止的简化版） */
    private static final Pattern CREATE_TABLE = Pattern.compile(
            "CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?([a-z_]+\\.[a-z_]+)\\s*\\((.*?)\\n\\);",
            Pattern.CASE_INSENSITIVE | Pattern.DOTALL);

    private static final Pattern SHOP_ID_COLUMN = Pattern.compile("(?im)^\\s*shop_id\\b");

    private static final Pattern DROP_TABLE =
            Pattern.compile("DROP\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?([a-z_]+\\.[a-z_]+)", Pattern.CASE_INSENSITIVE);

    private static final Pattern SET_SCHEMA = Pattern.compile(
            "ALTER\\s+TABLE\\s+([a-z_]+\\.[a-z_]+)\\s+SET\\s+SCHEMA\\s+([a-z_]+)", Pattern.CASE_INSENSITIVE);

    /** 后来补加 shop_id 列的表（表早于该列存在） */
    private static final Pattern ADD_SHOP_ID_COLUMN = Pattern.compile(
            "ALTER\\s+TABLE\\s+([a-z_]+\\.[a-z_]+)\\s+ADD\\s+COLUMN\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?shop_id\\b",
            Pattern.CASE_INSENSITIVE);

    @Test
    void 处理器清单与迁移脚本清单一致() throws IOException {
        Set<String> fromMigration = migrationTenantTables();

        assertThat(fromMigration)
                .as("V91 的 tenant_tables 必须与 ShopTenantHandler.TENANT_TABLES 逐项相等——两处各写一份，" + "漂移了就是「插件管了但 RLS 没管」或反过来")
                .isNotEmpty()
                .containsExactlyInAnyOrderElementsOf(ShopTenantHandler.TENANT_TABLES);
    }

    @Test
    void 迁移脚本里的表确实带shop_id列() throws IOException {
        Set<String> shopIdTables = tablesWithShopIdColumn();
        Set<String> fromMigration = migrationTenantTables();

        assertThat(shopIdTables)
                .as("V91 登记了某张表却没有 shop_id 列：policy 会引用一个不存在的列，建库时直接失败")
                .containsAll(fromMigration);
    }

    @Test
    void 新建的带shop_id的表必须登记进隔离清单() throws IOException {
        Set<String> shopIdTables = tablesWithShopIdColumn();
        Set<String> registered = ShopTenantHandler.TENANT_TABLES;

        List<String> missing = shopIdTables.stream()
                .filter(t -> !registered.contains(t))
                .sorted()
                .toList();

        assertThat(missing)
                .as("这些表有 shop_id 列却没登记进隔离清单：租户插件不管它、RLS 也没有 policy，"
                        + "等于一张完全不受隔离的表。要么加进 ShopTenantHandler.TENANT_TABLES + V91，"
                        + "要么在迁移里说明它为什么不该按店隔离")
                .isEmpty();
    }

    /**
     * 按版本顺序重放全部迁移，算出「当前还存在的、带 shop_id 列的表」。
     *
     * <p>只扫 CREATE TABLE 会得到三张已经不存在的表：{@code admin.shop_reviews} 与
     * {@code merchant_address.addresses} 先后被 {@code SET SCHEMA} 搬走（V48 / V46），
     * {@code merchant_address.address_roles} 被 V42 删掉。所以这里要跟着迁移重放表状态，
     * 否则门禁会因为「历史遗留」而永远红，最后被加进豁免清单——那正是所有门禁失效的起点。
     */
    private static Set<String> tablesWithShopIdColumn() throws IOException {
        Set<String> live = new LinkedHashSet<>();
        for (Path file : sortedByVersion()) {
            // 只剥行注释，不碰块注释：SQL 注释里常写接口路径（`/auth/*`、`admin/*`），
            // SourceScanner.withoutComments 会把那个 `/*` 当成块注释开头，一路吞到文件末尾——
            // V48 就是这么被吃掉的（它的 ALTER ... SET SCHEMA 全在注释之后）。
            String sql = stripLineComments(SourceScanner.read(file));

            // 先处理删表与搬 schema，再处理建表：同一文件里先删后建是常见写法（V42 就是）
            Matcher drop = DROP_TABLE.matcher(sql);
            while (drop.find()) {
                live.remove(drop.group(1).toLowerCase());
            }
            Matcher move = SET_SCHEMA.matcher(sql);
            while (move.find()) {
                String from = move.group(1).toLowerCase();
                String to = move.group(2).toLowerCase();
                if (live.remove(from)) {
                    live.add(to + "." + from.substring(from.indexOf('.') + 1));
                }
            }

            Matcher create = CREATE_TABLE.matcher(sql);
            while (create.find()) {
                String table = create.group(1).toLowerCase();
                if (SHOP_ID_COLUMN.matcher(create.group(2)).find()) {
                    live.add(table);
                } else {
                    live.remove(table);
                }
            }
            // 后来补加的 shop_id 列（V87 的 product.skus 就是这样）：表在更早的迁移里建、列在后来的
            // ALTER TABLE ... ADD COLUMN 里加，只认 CREATE TABLE 的列块会漏掉它
            Matcher addColumn = ADD_SHOP_ID_COLUMN.matcher(sql);
            while (addColumn.find()) {
                live.add(addColumn.group(1).toLowerCase());
            }
        }
        return live;
    }

    /** 只剥 {@code --} 行注释，保留换行（行号不飘）。SQL 里没有块注释的语义需求，刻意不认 {@code /*} */
    private static String stripLineComments(String source) {
        StringBuilder out = new StringBuilder(source.length());
        for (String line : source.split("\n", -1)) {
            int idx = line.indexOf("--");
            out.append(idx >= 0 ? line.substring(0, idx) : line).append('\n');
        }
        return out.toString();
    }

    /** 迁移脚本按版本号数值排序（V9 在 V90 之前，字符串排序会把它排到最后） */
    private static List<Path> sortedByVersion() throws IOException {
        return SourceScanner.files(MIGRATION_DIR, ".sql").stream()
                .sorted(java.util.Comparator.comparingInt(TenantTableVocabularyTest::versionOf))
                .toList();
    }

    private static int versionOf(Path file) {
        Matcher m = Pattern.compile("V(\\d+)__").matcher(file.getFileName().toString());
        return m.find() ? Integer.parseInt(m.group(1)) : Integer.MAX_VALUE;
    }

    /** 从 V91 的 tenant_tables 数组里取出表名 */
    private static Set<String> migrationTenantTables() throws IOException {
        List<String> names = new ArrayList<>();
        for (Path file : SourceScanner.files(MIGRATION_DIR, ".sql")) {
            String sql = SourceScanner.read(file);
            Matcher m = MIGRATION_LIST.matcher(sql);
            while (m.find()) {
                Matcher item = Pattern.compile("'([^']+)'").matcher(m.group(1));
                while (item.find()) {
                    names.add(item.group(1).toLowerCase());
                }
            }
        }
        return new LinkedHashSet<>(names);
    }
}
