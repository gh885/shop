package com.shop.platform;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;

/**
 * 授权覆盖面：**每个 HTTP 端点都必须有一个可指认的授权决定**。
 *
 * <p>为什么粒度是"方法"而不是"类"：类粒度太松——一个 controller 有 10 个端点、1 个接了判权就通过，
 * 另外 9 个裸着也没人知道。白名单也救不了：它是文件级的，只要整个控制器进了名单，
 * 之后往里加一个能改数据的端点会跟着豁免。所以豁免是端点上的 {@link Public} 标记，
 * 新端点不会继承任何东西。
 *
 * <p>三种可接受的证据，按强度排：
 *
 * <ol>
 *   <li>方法体里调了授权工厂（{@code authorizer.seller/platform/buyer(...)}）——卖家与平台侧必须走这条；
 *   <li>方法体（或本类的私有 helper）里调了 {@code authorizer.current()}——**只对买家侧成立**：
 *       买家的边界是 {@code buyer_id} 列绑定，没有权限点，令牌类型路由就是它的全部认证；
 *   <li>{@link Public} 标记——匿名入口。
 * </ol>
 *
 * <p>helper 解析只做**一级**：本类里某个私有方法调用了上面三种之一，那么调用它的端点算通过。
 * 不做跨类解析——跨类调用本身就说明授权被藏进了别的地方，那正是要拦的形态。
 *
 * <p><b>这个测试保证的是"每个端点都被判过权"，保证不了"权限点选得对"。</b>
 * 发货端点写成 {@code seller(Permission.ORDER_READ)} 一样全绿，因为确实判了。
 * 那类错误只能靠 review 和语义清单管。
 *
 * <p>与 {@code DataScopeTest} 同一形态：不起 Spring、不连库，纯文本扫描。
 */
class AuthorizationCoverageTest {

    private static final Pattern MAPPING = Pattern.compile("@(Get|Post|Put|Delete|Patch)Mapping");

    /** 签名：注解之后到 `{` 之前，最后一段是方法名。 */
    private static final Pattern METHOD_NAME =
            Pattern.compile("([A-Za-z_]\\w*)\\s*\\([^;{]*\\)\\s*(throws [^{]+)?\\{", Pattern.DOTALL);

    private static final Pattern FACTORY = Pattern.compile("authorizer\\s*\\.\\s*(seller|platform|buyer)\\s*\\(");

    private static final Pattern CURRENT = Pattern.compile("authorizer\\s*\\.\\s*current\\s*\\(");

    private static final Pattern PRIVATE_METHOD =
            Pattern.compile("private\\s+[\\w<>,\\[\\]\\s\\.]+?\\s+([A-Za-z_]\\w*)\\s*\\([^;{]*\\)\\s*\\{");

    /**
     * 已知未标记的端点。**这张表只会变短，加一条等于认领一份待办。**
     *
     * <p>它们还缺的东西分三类：匿名入口要挂 {@code @Public}（登录、公开浏览、渠道回调），
     * 卖家侧的"已认证即可"端点缺一个不要求权限点的 {@code authorizer.seller()}，
     * {@code SellerOperatorController} 的判权现在藏在 service 里、在这里看不见（要么搬上来，要么补 helper）。
     */
    private static final java.util.Set<String> PENDING_MARKING = java.util.Set.of();

    @Test
    void 每个端点都必须有可指认的授权决定() throws IOException {
        List<String> violations = new ArrayList<>();
        try (Stream<Path> files = Files.walk(Path.of("src", "main", "java"))) {
            files.filter(Files::isRegularFile)
                    .filter(path -> path.toString().endsWith("Controller.java"))
                    .forEach(path -> {
                        try {
                            scan(path.toString().replace('\\', '/'), violations);
                        } catch (IOException e) {
                            throw new IllegalStateException("读不到源文件: " + path, e);
                        }
                    });
        }
        assertThat(violations)
                .as(
                        "这些端点在方法体（含本类私有 helper）里既没有授权工厂调用、也没有 authorizer.current()、" + "也没有 @Public 标记——它们是裸的。逐条：%n%s",
                        String.join(System.lineSeparator(), violations))
                .isEmpty();
    }

    private static void scan(String path, List<String> violations) throws IOException {
        String source = Files.readString(Path.of(path), StandardCharsets.UTF_8);
        boolean sellerOrPlatform = isSellerOrPlatformController(path);

        // 一级 helper：私有方法 → 它提供了哪种证据
        Set<String> helpersWithFactory = new LinkedHashSet<>();
        Set<String> helpersWithCurrent = new LinkedHashSet<>();
        Matcher helper = PRIVATE_METHOD.matcher(source);
        while (helper.find()) {
            String body = bodyOf(source, helper.end() - 1);
            if (FACTORY.matcher(body).find()) {
                helpersWithFactory.add(helper.group(1));
            } else if (CURRENT.matcher(body).find()) {
                helpersWithCurrent.add(helper.group(1));
            }
        }

        Matcher mapping = MAPPING.matcher(source);
        while (mapping.find()) {
            int annotationStart = mapping.start();
            String tail = source.substring(mapping.end());
            Matcher name = METHOD_NAME.matcher(tail);
            if (!name.find()) {
                continue;
            }
            String methodName = name.group(1);
            String body = bodyOf(source, mapping.end() + name.end() - 1);

            if (isPublic(source, annotationStart)) {
                continue;
            }
            if (FACTORY.matcher(body).find()) {
                continue;
            }
            if (bodyCallsAny(body, helpersWithFactory)) {
                continue;
            }
            // authorizer.current() 只对买家侧成立：卖家/平台端点必须有工厂调用（池的匹配由类型决定）
            boolean buyerOnly = !sellerOrPlatform;
            if (buyerOnly && (CURRENT.matcher(body).find() || bodyCallsAny(body, helpersWithCurrent))) {
                continue;
            }
            String key = path.substring(path.indexOf("com/shop/platform/") + "com/shop/platform/".length()) + "#"
                    + methodName;
            if (PENDING_MARKING.contains(key)) {
                continue;
            }
            violations.add(path + ": " + methodName + " 没有授权决定"
                    + (sellerOrPlatform ? "（卖家/平台端点必须调 authorizer.seller/platform）" : ""));
        }
    }

    /** 卖家与平台 controller 不接受 `authorizer.current()` 当证据——那是"谁在操作"，不是"能不能做"。 */
    private static boolean isSellerOrPlatformController(String path) {
        String file = path.substring(path.lastIndexOf('/') + 1);
        return file.startsWith("Seller") || file.contains("Admin");
    }

    /** `@Public` 是否紧贴在这条 Mapping 之前（中间只允许其他注解与空白）。 */
    private static boolean isPublic(String source, int annotationStart) {
        int lineStart = source.lastIndexOf('\n', annotationStart);
        int from = Math.max(0, lineStart - 400);
        String before = source.substring(from, annotationStart);
        return before.lastIndexOf("@Public") > before.lastIndexOf('}');
    }

    /** 从 `{` 起取平衡括号内的正文。 */
    private static String bodyOf(String source, int openBrace) {
        int depth = 0;
        for (int i = openBrace; i < source.length(); i++) {
            char c = source.charAt(i);
            if (c == '{') {
                depth++;
            } else if (c == '}') {
                depth--;
                if (depth == 0) {
                    return source.substring(openBrace, i + 1);
                }
            }
        }
        return source.substring(openBrace);
    }

    private static boolean bodyCallsAny(String body, Set<String> helpers) {
        return helpers.stream().anyMatch(helper -> Pattern.compile("\\b" + helper + "\\s*\\(")
                .matcher(body)
                .find());
    }
}
