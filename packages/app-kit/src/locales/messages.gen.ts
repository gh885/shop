// 生成物，别手改：pnpm gen:i18n（判据与清单见 scripts/i18n-codegen.mjs、docs/conventions/i18n.md §5.5）
// 来源：packages/app-kit/src/locales/{zh-CN, en-US}/*.json
// 能写出这份文件就说明 codegen 判过了：每个 key 在所有语言都有值、每条消息都编译得过、
// 各语言参数集合一致。这条保证属于生成期，手改这份文件不会让它成立。

export type AppKitMessageKey =
    "appKit.confirm.cancel" |
    "appKit.confirm.confirm" |
    "appKit.error.network" |
    "appKit.form.hidePassword" |
    "appKit.form.showPassword" |
    "appKit.login.captchaAlt" |
    "appKit.login.captchaClick" |
    "appKit.login.captchaConfirm" |
    "appKit.login.captchaDesc" |
    "appKit.login.captchaLabel" |
    "appKit.login.captchaLoading" |
    "appKit.login.captchaPlaceholder" |
    "appKit.login.captchaRefresh" |
    "appKit.login.captchaTitle" |
    "appKit.login.codeSent" |
    "appKit.login.needCaptcha" |
    "appKit.login.needPhone" |
    "appKit.login.passwordLabel" |
    "appKit.login.passwordPlaceholder" |
    "appKit.login.passwordTab" |
    "appKit.login.resend" |
    "appKit.login.sendCode" |
    "appKit.login.smsCodeLabel" |
    "appKit.login.smsCodePlaceholder" |
    "appKit.login.smsTab" |
    "appKit.login.submit" |
    "appKit.login.successDescription" |
    "appKit.login.successTitle" |
    "appKit.time.unknown" |
    "appKit.topbar.searchLabel" |
    "appKit.topbar.searchPlaceholder"

type AppKitParamsByKey = {
    "appKit.login.resend": { countdown: string | number }
    "appKit.topbar.searchLabel": { brand: string | number }
}

export type AppKitParamsOf<K extends AppKitMessageKey> = K extends keyof AppKitParamsByKey
    ? AppKitParamsByKey[K]
    : undefined

/**
 * app-kit 自己的 `t` 形状：只认 `appKit.*`。三端调用侧不用它——各端生成物里那份
 * `XTranslate` 把本端 key 与这份并在一起，与运行时的解析链同一条（先查本端资源、再查共享资源）。
 * 无参消息的参数位是 `undefined`，多塞一个就是编译错误；带参消息漏传不拦（可选位）。
 */
export type AppKitTranslate = <K extends AppKitMessageKey>(
    key: K,
    params?: AppKitParamsOf<K>,
) => string

/** 一种语言里 AppKitMessageKey 的每一个都得有一句 */
export type AppKitCatalog = { [K in AppKitMessageKey]: string }
