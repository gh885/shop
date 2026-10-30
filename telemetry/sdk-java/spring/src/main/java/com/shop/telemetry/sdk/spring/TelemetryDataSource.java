package com.shop.telemetry.sdk.spring;

import java.io.PrintWriter;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.sql.CallableStatement;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.sql.SQLFeatureNotSupportedException;
import java.sql.Statement;
import java.util.Locale;
import java.util.Set;
import java.util.logging.Logger;
import javax.sql.DataSource;

/**
 * 挂载点 3/5：把 JDBC 调用变成 span。
 *
 * <p>为什么包 {@link DataSource} 而不是给 {@code JdbcTemplate} 加拦截器：shop 用的是
 * **MyBatis + JdbcClient**，两者都不经过 {@code JdbcTemplate} 的拦截器链。DataSource 是它们唯一的
 * 共同入口，包这一层等于一次覆盖 MyBatis / JdbcClient / JPA / 手写 JDBC。
 *
 * <p>实现用动态代理而不是手写几百行委托：JDBC 接口有上百个方法，手写的委托一定会漏几个，
 * 而漏掉的那个（通常是 {@code unwrap}）会在某个库升级后突然变成 ClassCastException。
 *
 * <p>三个刻意的取舍：
 *
 * <ol>
 *   <li>**按 SQL 动词分 op**（{@code db.select} / {@code db.insert} …）。全是 {@code db.query} 的话，
 *       "这条 trace 里谁在写库"在树上根本看不出来，而那正是排查数据问题时第一个要看的
 *   <li>**SQL 参数不采**。只采带占位符的原句：真值里有手机号、地址、金额。M2 的参数白名单落地前不采
 *   <li>**批处理只记一个 span**（{@code addBatch} 不计时，{@code executeBatch} 才开）：一批 100 条
 *       变成一个节点，而不是 100 个让人没法看的节点
 * </ol>
 *
 * <p>代价与限制：所有 SQL 多一次代理调用（纳秒级），且 {@code getConnection()} 每次返回**新的**
 * 代理对象——如果某段代码用 {@code ==} 比较两次拿到的连接，这里会不相等。排查时先想到这一点。
 */
final class TelemetryDataSource implements DataSource {

    private static final Set<String> STATEMENT_FACTORIES =
            Set.of("prepareStatement", "prepareCall", "createStatement");

    private static final int SQL_MAX = 200;

    private final DataSource delegate;

    TelemetryDataSource(DataSource delegate) {
        this.delegate = delegate;
    }

    @Override
    public Connection getConnection() throws SQLException {
        return wrapConnection(delegate.getConnection());
    }

    @Override
    public Connection getConnection(String username, String password) throws SQLException {
        return wrapConnection(delegate.getConnection(username, password));
    }

    @Override
    public PrintWriter getLogWriter() throws SQLException {
        return delegate.getLogWriter();
    }

    @Override
    public void setLogWriter(PrintWriter out) throws SQLException {
        delegate.setLogWriter(out);
    }

    @Override
    public void setLoginTimeout(int seconds) throws SQLException {
        delegate.setLoginTimeout(seconds);
    }

    @Override
    public int getLoginTimeout() throws SQLException {
        return delegate.getLoginTimeout();
    }

    @Override
    public Logger getParentLogger() throws SQLFeatureNotSupportedException {
        return delegate.getParentLogger();
    }

    @Override
    public <T> T unwrap(Class<T> iface) throws SQLException {
        return delegate.unwrap(iface);
    }

    @Override
    public boolean isWrapperFor(Class<?> iface) throws SQLException {
        return delegate.isWrapperFor(iface);
    }

    private static Connection wrapConnection(Connection connection) {
        if (connection == null) {
            return null;
        }
        return (Connection) proxy(Connection.class, connection, (target, method, args) -> {
            Object result = invoke(target, method, args);
            if (result instanceof Statement statement && STATEMENT_FACTORIES.contains(method.getName())) {
                return wrapStatement(statement, args);
            }
            return result;
        });
    }

    /**
     * @param factoryArgs {@code prepareStatement(sql)} 的参数；{@code createStatement()} 时为 null，
     *     这时 SQL 要等到 {@code execute(sql)} 才知道
     */
    private static Statement wrapStatement(Statement statement, Object[] factoryArgs) {
        String preparedSql = factoryArgs != null && factoryArgs.length > 0 && factoryArgs[0] instanceof String sql
                ? sql
                : null;
        Class<?> iface = statement instanceof CallableStatement
                ? CallableStatement.class
                : statement instanceof PreparedStatement ? PreparedStatement.class : Statement.class;
        return (Statement) proxy(iface, statement, (target, method, args) -> {
            String name = method.getName();
            if (!name.startsWith("execute")) {
                return invoke(target, method, args);
            }
            String sql = preparedSql;
            if (sql == null && args != null && args.length > 0 && args[0] instanceof String fromCall) {
                sql = fromCall;
            }
            try {
                return TelemetryTrace.inSpan(op(sql), describe(sql), () -> {
                    try {
                        return invoke(target, method, args);
                    } catch (Throwable t) {
                        throw new StatementFailure(t);
                    }
                });
            } catch (StatementFailure failure) {
                // 把原始 SQLException 原样还给调用方：采集层不能改变业务侧的异常语义
                throw failure.getCause();
            }
        });
    }

    /** SELECT / INSERT / UPDATE / DELETE 分开，界面上才能一眼看出"谁在写库"。 */
    static String op(String sql) {
        if (sql == null) {
            return "db.query";
        }
        String head = sql.stripLeading();
        if (head.length() < 6) {
            return "db.query";
        }
        String verb = head.substring(0, 6).toLowerCase(Locale.ROOT);
        if (verb.startsWith("select") || verb.startsWith("with") || verb.startsWith("show")) {
            return "db.select";
        }
        if (verb.startsWith("insert")) {
            return "db.insert";
        }
        if (verb.startsWith("update")) {
            return "db.update";
        }
        if (verb.startsWith("delete")) {
            return "db.delete";
        }
        if (verb.startsWith("merge")) {
            return "db.merge";
        }
        return "db.query";
    }

    /** 单行、压空白、截断：多行 SQL 会把 span 树挤成一片。 */
    static String describe(String sql) {
        if (sql == null || sql.isBlank()) {
            return "statement";
        }
        String flat = String.join(
                " ",
                sql.strip().lines().map(String::strip).filter(line -> !line.isEmpty()).toList());
        return flat.length() <= SQL_MAX ? flat : flat.substring(0, SQL_MAX) + "…";
    }

    private static Object proxy(Class<?> iface, Object target, Handler handler) {
        InvocationHandler invocationHandler = (proxy, method, args) -> {
            if (method.getDeclaringClass() == Object.class) {
                return method.invoke(target, args); // equals/hashCode/toString 交给真对象
            }
            return handler.handle(target, method, args);
        };
        return Proxy.newProxyInstance(iface.getClassLoader(), new Class<?>[] {iface}, invocationHandler);
    }

    private static Object invoke(Object target, Method method, Object[] args) throws Throwable {
        try {
            return method.invoke(target, args);
        } catch (InvocationTargetException e) {
            throw e.getCause();
        }
    }

    @FunctionalInterface
    private interface Handler {
        Object handle(Object target, Method method, Object[] args) throws Throwable;
    }

    /** 只为了穿过 {@code Supplier} 把受检异常带出来；到代理边界立刻还原。 */
    private static final class StatementFailure extends RuntimeException {

        StatementFailure(Throwable cause) {
            super(cause);
        }
    }
}
