// 生成物，别手改：pnpm gen:i18n（判据与清单见 scripts/i18n-codegen.mjs、docs/conventions/i18n.md §5.5）
// 来源：packages/app-kit/src/locales/{zh-CN, en-US}/*.json
// 能写出这份文件就说明 codegen 判过了：每个 key 在所有语言都有值、每条消息都编译得过、
// 各语言参数集合一致。这条保证属于生成期，手改这份文件不会让它成立。

export type AppKitMessageKey =
    "appKit.confirm.cancel" |
    "appKit.confirm.confirm" |
    "appKit.error.badRequest" |
    "appKit.error.conflict" |
    "appKit.error.forbidden" |
    "appKit.error.network" |
    "appKit.error.notFound" |
    "appKit.error.payloadTooLarge" |
    "appKit.error.rateLimited" |
    "appKit.error.serverError" |
    "appKit.error.unauthorized" |
    "appKit.error.validation" |
    "appKit.form.hidePassword" |
    "appKit.form.showPassword" |
    "appKit.locale.switch" |
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
    "appKit.routeError.description" |
    "appKit.routeError.label" |
    "appKit.routeError.retry" |
    "appKit.routeError.title" |
    "appKit.time.unknown" |
    "appKit.topbar.searchLabel" |
    "appKit.topbar.searchPlaceholder" |
    "appKit.ui.dataTable.allRowsLoaded" |
    "appKit.ui.dataTable.collapseRow" |
    "appKit.ui.dataTable.columnsMenu" |
    "appKit.ui.dataTable.dragToReorder" |
    "appKit.ui.dataTable.dragToReorderRow" |
    "appKit.ui.dataTable.empty" |
    "appKit.ui.dataTable.expandRow" |
    "appKit.ui.dataTable.filterClear" |
    "appKit.ui.dataTable.filterNoResults" |
    "appKit.ui.dataTable.filterSelectedCount" |
    "appKit.ui.dataTable.goToPage" |
    "appKit.ui.dataTable.loading" |
    "appKit.ui.dataTable.moveColumnEnd" |
    "appKit.ui.dataTable.moveColumnStart" |
    "appKit.ui.dataTable.nextPage" |
    "appKit.ui.dataTable.paginationEllipsis" |
    "appKit.ui.dataTable.paginationInfo" |
    "appKit.ui.dataTable.pinColumnEnd" |
    "appKit.ui.dataTable.pinColumnStart" |
    "appKit.ui.dataTable.pinRow" |
    "appKit.ui.dataTable.previousPage" |
    "appKit.ui.dataTable.reorderingUnavailable" |
    "appKit.ui.dataTable.reset" |
    "appKit.ui.dataTable.rowCreate" |
    "appKit.ui.dataTable.rowsPerPage" |
    "appKit.ui.dataTable.selectAll" |
    "appKit.ui.dataTable.selectRow" |
    "appKit.ui.dataTable.sortAscending" |
    "appKit.ui.dataTable.sortDescending" |
    "appKit.ui.dataTable.toggleColumns" |
    "appKit.ui.dataTable.unpinColumn" |
    "appKit.ui.dataTable.unpinRow" |
    "appKit.ui.dateTimePicker.clear" |
    "appKit.ui.dateTimePicker.done" |
    "appKit.ui.dateTimePicker.placeholder" |
    "appKit.ui.dateTimePicker.timeAria" |
    "appKit.ui.imageUpload.drag" |
    "appKit.ui.imageUpload.emptyAlt" |
    "appKit.ui.imageUpload.gridLabel" |
    "appKit.ui.imageUpload.readError" |
    "appKit.ui.imageUpload.remove" |
    "appKit.ui.imageUpload.uploadError" |
    "appKit.ui.maskedValue.aria" |
    "appKit.ui.maskedValue.ariaNoSubject" |
    "appKit.ui.maskedValue.view" |
    "appKit.ui.phoneField.ariaLabel" |
    "appKit.ui.phoneField.placeholder" |
    "appKit.ui.regionPicker.placeholder" |
    "appKit.ui.regionPicker.searchPlaceholder" |
    "appKit.ui.search.ariaLabel" |
    "appKit.ui.search.button" |
    "appKit.ui.search.placeholder" |
    "appKit.ui.select.placeholder" |
    "appKit.ui.stateError.retry" |
    "appKit.ui.stateError.retrying" |
    "appKit.ui.stateError.title" |
    "error.ADDRESS_LIMIT_EXCEEDED" |
    "error.AFTER_SALE_ALREADY_REFUNDED" |
    "error.BANNER_TIME_RANGE_INVALID" |
    "error.CAPTCHA_EXPIRED" |
    "error.CAPTCHA_INVALID" |
    "error.CAPTCHA_REQUIRED" |
    "error.CATEGORY_DISABLED" |
    "error.CATEGORY_NOT_LEAF" |
    "error.COUPON_ALREADY_CLAIMED" |
    "error.FORBIDDEN_WORD_HIT" |
    "error.INSUFFICIENT_STOCK" |
    "error.INVALID_TOKEN" |
    "error.MERCHANT_ADDRESS_LIMIT_EXCEEDED" |
    "error.NETWORK_ERROR" |
    "error.PERMISSION_DENIED" |
    "error.REFRESH_TOKEN_REUSED" |
    "error.REQUEST_ABORTED" |
    "error.REQUEST_TIMEOUT" |
    "error.RESPONSE_VALIDATION_FAILED" |
    "error.SHOP_LIMIT_EXCEEDED" |
    "error.SHOP_NAME_TAKEN" |
    "error.SMS_CODE_EXPIRED" |
    "error.SMS_CODE_INVALID" |
    "error.SMS_DAILY_LIMIT" |
    "error.SMS_RATE_LIMIT" |
    "error.STAFF_DISABLED" |
    "error.TOKEN_EXPIRED" |
    "error.USER_DISABLED" |
    "validation.MAX" |
    "validation.MAX_LENGTH" |
    "validation.MIN" |
    "validation.MIN_LENGTH" |
    "validation.PATTERN" |
    "validation.REQUIRED"

type AppKitParamsByKey = {
    "appKit.login.resend": { countdown: string | number }
    "appKit.topbar.searchLabel": { brand: string | number }
    "appKit.ui.dataTable.filterSelectedCount": { count: string | number }
    "appKit.ui.dataTable.goToPage": { page: string | number }
    "appKit.ui.dataTable.paginationInfo": { from: string | number; to: string | number; count: string | number }
    "appKit.ui.dataTable.unpinColumn": { title: string | number }
    "appKit.ui.dateTimePicker.timeAria": { label: string | number }
    "appKit.ui.maskedValue.aria": { subject: string | number; value: string | number }
    "appKit.ui.maskedValue.ariaNoSubject": { value: string | number }
    "error.ADDRESS_LIMIT_EXCEEDED": { limit: string | number }
    "error.MERCHANT_ADDRESS_LIMIT_EXCEEDED": { limit: string | number }
    "validation.MAX": { max: string | number }
    "validation.MAX_LENGTH": { max: string | number }
    "validation.MIN": { min: string | number }
    "validation.MIN_LENGTH": { min: string | number }
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
