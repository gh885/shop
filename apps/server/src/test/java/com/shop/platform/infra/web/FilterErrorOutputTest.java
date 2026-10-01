package com.shop.platform.infra.web;

import static org.assertj.core.api.Assertions.assertThat;

import com.shop.platform.testsupport.SourceScanner;
import java.io.IOException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;

/**
 * 「错误响应只有一个生产者」的**结构**门禁：拦截链层（过滤器 / 拦截器）里一个失败响应都不许自己拼，
 * 一律 {@code FilterExceptionHandler.resolve(request, response, ex)} 转交 MVC 的统一异常处理器。
 *
 * <p>为什么需要它：{@code FilterExceptionHandler} 的类注释与 {@code ErrorBodyVocabularyTest} 的一句注释
 * 都在宣称「过滤器里的 401 与 {@code GlobalExceptionHandler} 走同一个 ProblemDetail」，但那是散文——
 * 没有任何测试钉住。散文不会红，下一份手搓的响应体也不会红：
 * {@code ErrorResponseContractTest} 只看它真跑到的那几条路径，{@code ErrorBodyVocabularyTest} 只看
 * {@code setProperty} 的键（手写一份 {@code response.getWriter().write("{\"status\":…}")} 里一个
 * {@code setProperty} 都没有，两边都失明）。
 *
 * <p>判据（扫到的文件 = 拦截链层）：{@code src/main/java} 全部 java 文件里，命中以下任一条即算——
 * {@code extends …OncePerRequestFilter}、{@code implements …Filter / HandlerInterceptor}、
 * 或类名以 {@code Filter} / {@code Interceptor} 结尾。三条一起用是刻意的：只认「继承 OncePerRequestFilter」
 * 会漏掉实现 {@code jakarta.servlet.Filter} 的写法与老式拦截器，而拦截器与过滤器在这一件事上是同一种角色
 * （都在 MVC 之前/之外写响应）。今天实测命中 7 个文件：{@code RequestIdFilter}、{@code RequestBodySizeFilter}、
 * {@code JwtAuthFilter}、{@code StaffAuthFilter}、{@code ShopMembershipFilter}、
 * {@code HttpRequestLoggingInterceptor}、{@code PermissionInterceptor}。
 *
 * <p><b>没有豁免清单，是刻意的。</b>这道门禁落地时扫到的唯一一处违规是 {@code RequestBodySizeFilter}
 * 的 413（SEC-04 的 1MB 闸门），当时的登记理由是「它要在 Jackson 解析之前掐掉，进不了 dispatcher，
 * 因此没有 BusinessException 可转交」——那个理由站不住：「在解析之前掐掉」说的是**位置**，不是**响应写法**，
 * {@code JwtAuthFilter} 同样跑在 dispatcher 之前，它一直经 {@code FilterExceptionHandler} 转交。
 * 那一处已改走统一出口，代价也随之消失（此前它发的是小写点分的 {@code request.too_large}，
 * 不在任何一份词表里，前端 catalog 永远命中不了，英文界面会直接露出那句中文；也没有
 * {@code requestId} / {@code instance} / {@code Cache-Control: no-store}）。
 * 口径没有例外清单：要靠例外维持的口径，下一个人就会照清单抄第二份。
 *
 * <p>无库、无 Spring、无 MockMvc：纯文本扫描，本地没起数据面也在跑。与 {@link ErrorResponseContractTest}
 * 的分工是「只有一个出口」（本条，静态）对「那个出口的形状对」（那条，运行时真链）。
 */
class FilterErrorOutputTest {

    /** 拦截链层的三条判据（见类注释）；`[^{;]*` 允许 implements 列表跨行，也允许一次实现多个接口。 */
    private static final Pattern INTERCEPTION_LAYER = Pattern.compile("extends\\s+\\w*OncePerRequestFilter\\b"
            + "|implements\\s+[^{;]*\\b(?:\\w*Filter|HandlerInterceptor)\\b"
            + "|\\bclass\\s+\\w+(?:Filter|Interceptor)\\b");

    /**
     * 手写错误体的形状。接收者写成通配（{@code .setStatus(} 而不是 {@code response.setStatus(}）是刻意的：
     * 把形参改名成 {@code resp} / {@code res} 就能绕过一条按变量名写死的正则，而这一层的每个文件都该只经
     * 统一出口，误报会以「某文件多一条」的形式当场出现，比静默漏检好。
     *
     * <p>{@code getOutputStream} 是清单外补的一条：它与 {@code getWriter} 是同一件事的字节流写法，
     * 少这一条就留下一个明摆着的后门。
     */
    private static final Pattern HAND_WRITTEN_ERROR_OUTPUT = Pattern.compile("\\.setStatus\\("
            + "|\\.getWriter\\("
            + "|\\.getOutputStream\\("
            + "|\\.sendError\\("
            + "|new\\s+ProblemDetail\\b"
            + "|HttpServletResponse\\s*\\.\\s*SC_");

    /**
     * 转交统一处理器的调用形状。不写 {@code exceptionHandler.resolve(} 而写实参：字段名是实现细节，
     * 这条断言要的是「把 request / response 一起交给了某个 resolver」，换字段名不该红。
     */
    private static final Pattern DELEGATED_TO_MVC = Pattern.compile("\\.resolve\\(\\s*request\\s*,\\s*response\\s*,");

    @Test
    void 拦截链层源码_不出现手写错误体的形状() throws Exception {
        List<Path> scanned = interceptionLayer();
        assertThat(scanned)
                .as("扫到的过滤器/拦截器只有 %d 个（期望 ≥2）：判据或源码布局变了，" + "这条门禁已经扫不到东西，也就拦不住任何手写响应体", scanned.size())
                .hasSizeGreaterThanOrEqualTo(2);

        Set<String> violations = new TreeSet<>();
        for (Path file : scanned) {
            String rel = SourceScanner.rel(SourceScanner.MAIN_JAVA, file);
            String code = SourceScanner.withoutComments(SourceScanner.read(file));
            Matcher matcher = HAND_WRITTEN_ERROR_OUTPUT.matcher(code);
            while (matcher.find()) {
                violations.add(
                        rel + ":" + lineNumber(code, matcher.start()) + " → " + matchText(code, matcher.start()));
            }
        }

        assertThat(violations)
                .as("过滤器/拦截器不许自己拼错误响应：手写的那一份不会经过 GlobalExceptionHandler，"
                        + "于是 code / params / errors / requestId / no-store 这几格随写法漂移，"
                        + "而它照样能编译、能通过只看状态码的接口测试。改走"
                        + " FilterExceptionHandler.resolve(request, response, ex)（注入该 bean 即可，"
                        + "它在 dispatcher 之外的过滤器里一样工作，JwtAuthFilter 与 RequestBodySizeFilter 都是这么用的）")
                .isEmpty();
    }

    /**
     * 反空转：上面那条断言的「不违规」有两种可能——真没有手写响应，或扫描根本没读到代码。
     * 这里要求扫到至少一处转交统一处理器的调用，把后者排除掉（三个过滤器就是那三处）。
     */
    @Test
    void 扫描确实读到了代码_拦截链层里存在转交统一处理器的调用() throws Exception {
        List<String> delegating = new ArrayList<>();
        for (Path file : interceptionLayer()) {
            String code = SourceScanner.withoutComments(SourceScanner.read(file));
            if (DELEGATED_TO_MVC.matcher(code).find()) {
                delegating.add(SourceScanner.rel(SourceScanner.MAIN_JAVA, file));
            }
        }
        assertThat(delegating)
                .as("一处 resolve(request, response, …) 都没扫到：要么扫描没读到代码（去注释、路径、编码哪一步瞎了），"
                        + "要么过滤器已经改用别的出口——两条都得先在这里红，不能让上面那条以「无违规」假绿")
                .isNotEmpty();
    }

    /**
     * 拦截链层的全部文件，按路径排序（失败清单可复现，沿用 SourceScanner 的口径）。
     *
     * <p>判据也在去注释后的源码上跑：注释里写一句「像 XxxFilter 那样」不该把文件拖进扫描面，
     * 否则扫描面会随散文漂移，而扫描面一旦漂移，「没扫到」就被读成「没问题」。
     */
    private static List<Path> interceptionLayer() throws IOException {
        List<Path> out = new ArrayList<>();
        for (Path file : SourceScanner.javaFiles(SourceScanner.MAIN_JAVA)) {
            if (INTERCEPTION_LAYER
                    .matcher(SourceScanner.withoutComments(SourceScanner.read(file)))
                    .find()) {
                out.add(file);
            }
        }
        return out;
    }

    /** 违规点所在的原始行号：{@code withoutComments} 保留换行，所以偏移量能直接换算回行号。 */
    private static int lineNumber(String code, int offset) {
        int line = 1;
        for (int i = 0; i < offset && i < code.length(); i++) {
            if (code.charAt(i) == '\n') {
                line++;
            }
        }
        return line;
    }

    /** 违规点所在行的原文（去掉首尾空白），失败信息里要能一眼看出写的是什么。 */
    private static String matchText(String code, int offset) {
        int start = code.lastIndexOf('\n', offset) + 1;
        int end = code.indexOf('\n', offset);
        return (end < 0 ? code.substring(start) : code.substring(start, end)).trim();
    }
}
