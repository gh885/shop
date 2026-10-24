# 错误处理

> 定位：**出错时返回什么、返回给谁、留下什么**的唯一约定。
>
> 这套是从主分支原样继承的，不是重写期新设计的——错误响应是 API 契约里最难改的部分，客户端按 `code` 写分支、按 `status` 分流、拿 `requestId` 报障。换一套等于让所有客户端回到 default 分支。

## 0. 一句话

对外形状是 RFC 9457 `ProblemDetail`；错误码清单只存在 `contracts/error-codes.yaml` 一份；系统类错误对外模糊、对内留全。

---

## 1. 响应形状

```json
{
    "status": 409,
    "title": "Conflict",
    "detail": "库存不足",
    "code": "INSUFFICIENT_STOCK",
    "requestId": "3f9c2a7b1d54",
    "errors": [{ "field": "items[0].quantity", "rule": "Max", "max": 10, "message": "..." }],
    "params": { "limit": 20 }
}
```

四个扩展属性各有分工：

- `code` —— 只在**前端无法仅凭 status 区分**时才出现。没有它的错误，前端按状态码处理。
- `errors` —— 字段级明细，用来标红输入框。
- `params` —— 结构化上下文，把「只有后端知道的值」从句子里拆出来（典型是各种上限）。上限从 20 改成 30 时前端零改动。
- `requestId` —— 关联日志。永远非空。

**为什么用 `ProblemDetail` 而不是自造一个 ErrorBody**：它是标准，Spring 原生支持，客户端和网关都认。自造一个只会让每个 SDK 多写一层适配。

---

## 2. 错误码只在一种情况下新增

**当前端无法仅凭 HTTP status 区分时。**

这条是整套体系的闸门。不加这条，最后会有一堆「为什么失败」的码，前端一个都不用，全部走 toast 展示 detail。

`contracts/error-codes.yaml` 里每个码带 `group` / `code` / `status` / `behavior` / `trigger` / `notes`，其中 `behavior` 写的是**前端应该怎么反应**（按码分支 / 不按码分支、进不进倒计时、要不要刷验证码图）。这份文件描述的是产品契约，不是代码注释。

---

## 3. 三边等式

```
contracts/error-codes.yaml  →  ErrorCodes.java
                            →  packages/common/src/contract/error-codes.ts
```

主分支靠一个 codegen 脚本从注册表生成另外两边。**重写期那套脚本没恢复**，Java 侧改由 `ErrorCodeVocabularyTest` 盯住：解析 YAML 的 `code:` 行，跟 `ErrorCodes` 的静态常量做双向差集，少一个多一个都红灯。

这是个明确的缺口，记在这里：TS 侧目前还是主分支生成的那份，等前端重建时要么恢复 codegen，要么也加一条对拍测试。

---

## 4. 状态码口径

| 场景                     | 状态   | 谁负责                                           |
| ------------------------ | ------ | ------------------------------------------------ |
| 参数校验失败（`@Valid`） | 422    | `MethodArgumentNotValidException`                |
| 请求体不是合法 JSON      | 400    | `HttpMessageNotReadableException`                |
| 缺少必填查询参数         | 400    | `MissingServletRequestParameterException`        |
| 参数类型不匹配           | 400    | `MethodArgumentTypeMismatchException`            |
| 路由不存在               | 404    | `NoResourceFoundException`                       |
| 方法不支持               | 405    | `HttpRequestMethodNotSupportedException`         |
| Content-Type 不支持      | 415    | `HttpMediaTypeNotSupportedException`             |
| 业务失败                 | 自定义 | `BusinessException`（带 `status` 和可选 `code`） |
| 其它一切                 | 500    | `Exception` 兜底                                 |

**框架级 4xx 必须逐个显式接住。** `GlobalExceptionHandler` 没有继承 `ResponseEntityExceptionHandler`，漏一个就落进 500 兜底——客户端传错 Content-Type，服务端把锅背成"内部错误"，排查方向被带偏。405 和 415 就是踩过之后补上的。

---

## 5. 字段级明细为什么带 `rule`

`errors[]` 里除了 `field` 和 `message`（成品中文），还有 `rule` / `min` / `max` / `value`：

- `rule` 来自 `common.ValidationRules` 词表，前端据此出**自己语言的**那句话，不显示后端中文
- `min` / `max` 是规则边界，后端常量改了前端跟着变
- `value` 是命中的数据（违禁词、越界数字），用来参数化句子

只给 `message` 的话，前端要么显示中文，要么自己猜规则。词表刻意停在「可复用的规则」而不是「一字段一码」——字段名由 `field` 出，规则名由 `rule` 出，两者在前端拼句子就够。

---

## 6. 不对外说内部话

500 的 `detail` 固定是「服务器内部错误」。堆栈、SQL、参数、异常类名只进日志，带 `requestId` 关联。

回显给客户端的参数值会被截断到 100 字符——类型不匹配的 `value` 是客户端可控的任意长串，原样写进 `detail` 等于给日志膨胀和反射型信息泄露开门。

---

## 7. 其它两条硬要求

**错误响应带 `Cache-Control: no-store`。** 中间层缓存一个 500 或一个 409，会比没有错误处理更难受。

**只在边界捕获。** 全系统只有两处把异常翻译成对外的东西：`GlobalExceptionHandler`（HTTP 边界）、消息消费者（MQ 边界）。业务代码里 `catch` 之后既不抛也不记，是最常见的坏味道——错误凭空消失，监控上一切正常。

---

## 8. 现在没做的

- **codegen 脚本未恢复**：Java 侧靠对拍测试盯住，TS 侧待前端重建时处理。
- **`errors[].rule` 的前端词表消费**：前端还没重建，`packages/common` 里那份是主分支的。
- **错误聚合监控**：等有真实流量。现在错误率恒为零，做了也是看空图。

---

## 9. `detail` 的定位：诊断文案，不是用户文案

用户看得懂的话由前端按 `code`（和 status）解析，后端**不做 `Accept-Language` 协商**——这是立场，
不是欠账。理由：

- `code` / `errors` / `params` 已经把「前端要做反应」需要的信息结构化地给全了（§1 的分工），
  `detail` 里再长出一份多语言文案，等于同一句话存两处，必然漂。
- `detail` 会进日志和第三方联调记录，写成服务端语言的完整句子正好；它不需要被展示给终端用户。
- 三端 SPA 与后端同仓同发，语言协商天然在前端完成（`@shop/i18n`）。

翻案条件：出现「要把 `detail` 直接展示给用户」的异构客户端时，把 `detail` 升级成 message key 再谈。
