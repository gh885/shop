package com.shop.platform.rum.processor;

import java.util.List;
import java.util.Optional;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * 路径归一化：把 {@code route} / {@code endpoint} / {@code to} 三个路径字段收成模板。
 *
 * <p>前端契约第 1 条要求 `route` 取路由模板、第 5 条要求不采 URL 的 query 与 hash——**两件都是前端的自觉**。
 * 这个端点匿名可达，所以服务端不能假设它做到了：一条带着 `?token=…` 的 route 会原样进日志（那里正躺着
 * 最不该躺的东西），而 `/orders/12345` 这种每个订单一条的路径，进日志是噪声、将来进明细表是无界基数。
 * 这一步就是把那两条契约**在执行侧兑现**，而不是指望发送端守规矩。
 *
 * <p>砍 query 与 hash 是硬要求；段模板化**只认纯数字段**，这一条是照抄前端 `toRouteTemplate` 的取舍：
 * 「宁可模板化得不完美，也不要猜错」。代价是 `/orders/abc123` 这种非数字 id 仍然原样留着——
 * 服务端没有 params 表，无从知道那段是 id 还是一个真实的路径名，猜错会把 `/user/settings` 改成 `/user/$id`。
 * 前端知道参数名，所以它是 `$orderId`、这里只能到 `$id`；两边不是重复实现。
 */
@Component
@Order(20)
public class RouteTemplateProcessor implements RumProcessor {

    /**
     * 只有这三个字段是路径。名字写死在这里而不是「凡是叫 route 的都改」：
     * 它决定了哪些值会被重写，而重写错了就是数据丢失——穷举是这里唯一稳的做法。
     */
    private static final List<String> PATH_FIELDS = List.of("route", "endpoint", "to");

    @Override
    public String name() {
        return "route-template";
    }

    @Override
    public Optional<JsonNode> process(JsonNode event) {
        if (!event.isObject()) {
            return Optional.of(event);
        }
        ObjectNode object = (ObjectNode) event;
        for (String field : PATH_FIELDS) {
            JsonNode value = object.path(field);
            if (!value.isString()) {
                continue;
            }
            String original = value.asString();
            String templated = template(original);
            if (!templated.equals(original)) {
                object.put(field, templated);
            }
        }
        return Optional.of(event);
    }

    /**
     * 先砍 query 与 hash，再按 `/` 分段把纯数字段换成 `$id`。
     *
     * <p>按**整段**判而不是字符串替换：子串替换会把 `/orders/12345` 里的 `12` 换成 `$id`，
     * 拼出 `/orders/$id345`——一个看着像模板、其实每个订单还是各不相同的东西，
     * 而且这种错不会报任何错，只会让基数悄悄地涨。
     */
    static String template(String raw) {
        int cut = raw.length();
        int query = raw.indexOf('?');
        if (query >= 0) {
            cut = query;
        }
        int hash = raw.indexOf('#');
        if (hash >= 0) {
            cut = Math.min(cut, hash);
        }
        String path = raw.substring(0, cut);
        // 截断后可能是空串（整条就是个 query）：原样返回，让落点那层按 MAX_LABEL 处理
        if (path.isEmpty()) {
            return path;
        }
        String[] segments = path.split("/", -1);
        StringBuilder out = new StringBuilder(path.length());
        for (int i = 0; i < segments.length; i++) {
            if (i > 0) {
                out.append('/');
            }
            String segment = segments[i];
            out.append(isNumeric(segment) ? "$id" : segment);
        }
        return out.toString();
    }

    private static boolean isNumeric(String segment) {
        if (segment.isEmpty()) {
            return false;
        }
        for (int i = 0; i < segment.length(); i++) {
            if (!Character.isDigit(segment.charAt(i))) {
                return false;
            }
        }
        return true;
    }
}
