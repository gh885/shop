package com.shop.platform.testsupport;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Set;

/**
 * 词表 / 规则门禁共用的源码扫描。
 *
 * <p>这些门禁的骨架是同一件事：走一遍目录、读进来、把注释去掉、再拿正则去数。此前八份门禁各写一遍，于是
 * 「走目录」有四种写法（三处 {@code Files.walk} 连流都没关），去注释有三种语义（块注释留不留空格、行注释吃不吃
 * 尾随注释、字符串里的斜杠星算不算注释）。差别平时看不见；一旦某个门禁因为「注释里的字符串也被数进去了」而假绿，
 * 没人会去对八份实现。
 *
 * <p>所以这里只有一个口径，两个性质是刻意的：
 *
 * <ul>
 *   <li>结果按路径排序——门禁失败信息里那份清单必须每次跑出来一样，否则 diff 噪声盖过真违规；
 *   <li>{@link #withoutComments(String)} 保留换行、整段块注释换成一个空格——行号与原文对齐（逐行扫描的门禁靠
 *       这个指认违规行），块注释也不会把相邻两个 token 粘成一个（注释前后各留一个字界）。
 * </ul>
 */
public final class SourceScanner {

    /** maven 模块内主源码根（测试进程的 cwd 就是模块根，即 {@code apps/server}）。 */
    public static final Path MAIN_JAVA = Path.of("src", "main", "java");

    /** 仓库根：跨端门禁同时要看 {@code docs/}、{@code packages/}、{@code openapi/}。 */
    public static final Path REPO_ROOT = Path.of("..", "..");

    /** 不进扫描的目录名：构建产物、依赖与生成物。生成物（{@code packages/api/src/sdk}）归生成物自己的门禁管。 */
    private static final Set<String> PRUNED_DIRS = Set.of("node_modules", "dist", "build", "target", "out", "sdk");

    private SourceScanner() {}

    /**
     * {@code root} 下所有后缀命中的普通文件，按路径排序。
     *
     * <p>{@code root} 不存在时给空表而不是抛异常：只检后端源码的环境里，跨端门禁也该跑得完；漏检由门禁自带的
     * 「扫描本身有效」那条断言负责，不由 IOException 负责。
     */
    public static List<Path> files(Path root, String... suffixes) throws IOException {
        if (!Files.isDirectory(root)) {
            return List.of();
        }
        List<Path> found = new ArrayList<>();
        Files.walkFileTree(root, new SimpleFileVisitor<>() {
            @Override
            public FileVisitResult preVisitDirectory(Path dir, BasicFileAttributes attrs) {
                String name = dir.getFileName().toString();
                // 点开头的目录（.git、.mvn、工具自己的缓存）里没有门禁要看的东西
                return PRUNED_DIRS.contains(name) || name.startsWith(".")
                        ? FileVisitResult.SKIP_SUBTREE
                        : FileVisitResult.CONTINUE;
            }

            @Override
            public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) {
                String name = file.getFileName().toString();
                for (String suffix : suffixes) {
                    if (name.endsWith(suffix)) {
                        found.add(file);
                        break;
                    }
                }
                return FileVisitResult.CONTINUE;
            }
        });
        found.sort(Comparator.comparing(Path::toString));
        return found;
    }

    /** {@code root} 下的 java 文件，按文件名排除给定那几个（事件出口、门禁自身之类）。 */
    public static List<Path> javaFiles(Path root, String... excludeFileNames) throws IOException {
        List<Path> out = new ArrayList<>();
        for (Path file : files(root, ".java")) {
            String name = file.getFileName().toString();
            if (!List.of(excludeFileNames).contains(name)) {
                out.add(file);
            }
        }
        return out;
    }

    public static String read(Path file) throws IOException {
        return Files.readString(file, StandardCharsets.UTF_8);
    }

    /** 逐行读，不裁剪（去不去注释、丢不丢空行，由调用点的语义决定）。 */
    public static List<String> lines(Path file) throws IOException {
        return List.of(read(file).split("\n"));
    }

    /** 相对 {@code base} 的斜杠路径：失败信息里指认违规文件，反斜杠在 CI 日志里没法读。 */
    public static String rel(Path base, Path file) {
        return base.relativize(file).toString().replace('\\', '/');
    }

    /**
     * 去掉行注释与块注释，<b>保留换行</b>（行号不飘，行级锚点照旧能用），并且<b>认字符串</b>。
     *
     * <p>不认字符串会瞎：{@code packages/ui-web/src/components/image-upload.tsx} 里
     * {@code const ACCEPT_IMAGE} 被赋成带 MIME 通配的那个串（斜杠后面跟星号），下一行紧跟
     * {@code const MAX_SIZE_MB = 10}，再下一行才是一个正常的块注释。用「斜杠星号 … 星号斜杠」的非贪婪
     * replaceAll 扫注释时，会从字符串里那个斜杠星号一路吞到下一个星号斜杠，中间那行代码在扫描器眼里就不存在
     * 了——FieldRule 那一轮的 census 正是靠这条才发现自己瞎（{@code MAX_SIZE_MB} 一开始既不在 found 也不在
     * skipped）。
     *
     * <p>代价是反方向的：JSX 文本里的裸撇号（{@code don't}）会被当成开引号。所以这里对单引号与双引号只认到
     * 行尾为止（JS 里它们本来也不许跨行），最坏只遮住半行；模板串允许跨行，按引号闭合。
     *
     * <p>块注释整段换成一个空格而不是干脆抹掉：注释两侧的 token 不能粘成一个，否则 {@code a}注释{@code b}
     * 会被读成一个 {@code ab}。
     */
    public static String withoutComments(String source) {
        StringBuilder out = new StringBuilder(source.length());
        int i = 0;
        while (i < source.length()) {
            char c = source.charAt(i);
            char next = i + 1 < source.length() ? source.charAt(i + 1) : 0;
            if (c == '/' && next == '/') {
                while (i < source.length() && source.charAt(i) != '\n') {
                    i++;
                }
                continue;
            }
            if (c == '/' && next == '*') {
                i += 2;
                while (i < source.length()
                        && !(source.charAt(i) == '*' && i + 1 < source.length() && source.charAt(i + 1) == '/')) {
                    if (source.charAt(i) == '\n') {
                        out.append('\n');
                    }
                    i++;
                }
                i = Math.min(source.length(), i + 2);
                out.append(' ');
                continue;
            }
            if (c == '"' || c == '\'' || c == '`') {
                out.append(c);
                i++;
                while (i < source.length()) {
                    char d = source.charAt(i);
                    out.append(d);
                    i++;
                    if (d == '\\' && i < source.length()) {
                        out.append(source.charAt(i));
                        i++;
                        continue;
                    }
                    if (d == c) {
                        break;
                    }
                    if (d == '\n' && c != '`') {
                        break;
                    }
                }
                continue;
            }
            out.append(c);
            i++;
        }
        return out.toString();
    }
}
