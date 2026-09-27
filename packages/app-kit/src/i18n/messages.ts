import {
    formatMessage,
    getCurrentLocale,
    resolveMessage,
    type I18nResources,
    type MessageParams,
} from "@shop/common"

export const APP_KIT_MESSAGES: I18nResources = {
    "zh-CN": {
        "appKit.error.network": "操作失败，请稍后重试",
        "appKit.time.unknown": "时间未知",
        "appKit.confirm.cancel": "取消",
        "appKit.confirm.confirm": "确定",
        "appKit.form.showPassword": "显示密码",
        "appKit.form.hidePassword": "隐藏密码",
        "appKit.topbar.searchPlaceholder": "搜索菜单、功能",
        "appKit.topbar.searchLabel": "{brand}搜索菜单、功能",
        "appKit.login.smsTab": "验证码登录",
        "appKit.login.passwordTab": "密码登录",
        "appKit.login.captchaPlaceholder": "输入右图 4 位字符",
        "appKit.login.captchaLabel": "图形验证码",
        "appKit.login.captchaRefresh": "刷新图形验证码",
        "appKit.login.captchaAlt": "图形验证码",
        "appKit.login.captchaClick": "点击获取",
        "appKit.login.smsCodeLabel": "短信验证码",
        "appKit.login.smsCodePlaceholder": "请输入验证码",
        "appKit.login.resend": "{countdown}s 后重发",
        "appKit.login.sendCode": "获取验证码",
        "appKit.login.passwordLabel": "密码",
        "appKit.login.passwordPlaceholder": "请输入密码",
        "appKit.login.submit": "登录",
        "appKit.login.successTitle": "登录成功",
        "appKit.login.successDescription": "欢迎回来",
        "appKit.login.codeSent": "验证码已发送",
    },
    "en-US": {
        "appKit.error.network": "Something went wrong. Please try again later.",
        "appKit.time.unknown": "Unknown time",
        "appKit.confirm.cancel": "Cancel",
        "appKit.confirm.confirm": "Confirm",
        "appKit.form.showPassword": "Show password",
        "appKit.form.hidePassword": "Hide password",
        "appKit.topbar.searchPlaceholder": "Search menus and features",
        "appKit.topbar.searchLabel": "Search menus and features in {brand}",
        "appKit.login.smsTab": "SMS code",
        "appKit.login.passwordTab": "Password",
        "appKit.login.captchaPlaceholder": "Enter the 4 characters",
        "appKit.login.captchaLabel": "CAPTCHA",
        "appKit.login.captchaRefresh": "Refresh CAPTCHA",
        "appKit.login.captchaAlt": "CAPTCHA",
        "appKit.login.captchaClick": "Click to get",
        "appKit.login.smsCodeLabel": "SMS code",
        "appKit.login.smsCodePlaceholder": "Enter the code",
        "appKit.login.resend": "Resend in {countdown}s",
        "appKit.login.sendCode": "Get code",
        "appKit.login.passwordLabel": "Password",
        "appKit.login.passwordPlaceholder": "Enter your password",
        "appKit.login.submit": "Sign in",
        "appKit.login.successTitle": "Signed in",
        "appKit.login.successDescription": "Welcome back",
        "appKit.login.codeSent": "Verification code sent",
    },
}

export function translateAppKit(key: string, params?: MessageParams): string {
    const locale = getCurrentLocale()
    const template = resolveMessage(APP_KIT_MESSAGES, key, locale)
    if (template === undefined) return key
    return formatMessage(template, params, locale)
}
