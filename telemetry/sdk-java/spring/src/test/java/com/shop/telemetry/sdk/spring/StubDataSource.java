package com.shop.telemetry.sdk.spring;

import java.io.PrintWriter;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.util.logging.Logger;
import javax.sql.DataSource;

/**
 * 测试用的假 DataSource：只实现被测路径用到的方法，其余返回默认值。
 *
 * <p>比引一个内存库更能定位问题——真库出错时，"是代理错了还是驱动/方言错了"要多查半小时。
 */
final class StubDataSource implements DataSource {

    @Override
    public Connection getConnection() {
        return stub(Connection.class, (proxy, method, args) -> switch (method.getName()) {
            case "prepareStatement" -> statement((String) args[0]);
            default -> defaultValue(method);
        });
    }

    @Override
    public Connection getConnection(String username, String password) {
        return getConnection();
    }

    @Override
    public PrintWriter getLogWriter() {
        return null;
    }

    @Override
    public void setLogWriter(PrintWriter out) {}

    @Override
    public void setLoginTimeout(int seconds) {}

    @Override
    public int getLoginTimeout() {
        return 0;
    }

    @Override
    public Logger getParentLogger() {
        return null;
    }

    @Override
    public <T> T unwrap(Class<T> iface) {
        return null;
    }

    @Override
    public boolean isWrapperFor(Class<?> iface) {
        return false;
    }

    private static PreparedStatement statement(String sql) {
        return stub(PreparedStatement.class, (proxy, method, args) -> {
            if (!method.getName().startsWith("execute")) {
                return defaultValue(method);
            }
            if (sql.contains("broken")) {
                throw new SQLException("boom");
            }
            // executeQuery 返回 null、executeUpdate 返回 0：按声明的返回类型给默认值，
            // 否则调用方拆箱时会 ClassCastException
            return defaultValue(method);
        });
    }

    static <T> T stub(Class<T> iface, InvocationHandler handler) {
        return iface.cast(Proxy.newProxyInstance(StubDataSource.class.getClassLoader(), new Class<?>[] {iface}, handler));
    }

    static Object defaultValue(Method method) {
        Class<?> type = method.getReturnType();
        if (type == boolean.class) {
            return false;
        }
        if (type == int.class) {
            return 0;
        }
        if (type == long.class) {
            return 0L;
        }
        if (type == double.class) {
            return 0d;
        }
        if (type == float.class) {
            return 0f;
        }
        if (type == short.class) {
            return (short) 0;
        }
        if (type == byte.class) {
            return (byte) 0;
        }
        if (type == char.class) {
            return (char) 0;
        }
        return null;
    }
}
