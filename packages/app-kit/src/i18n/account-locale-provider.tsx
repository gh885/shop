import { useCallback, useEffect, useMemo, useRef, type ReactNode } from "react"
import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { isAppLocale, type AppLocale, type I18nInstance } from "@shop/common/i18n"
import type { AuthStatus } from "@shop/common/contract"
import { writeLocaleCookie } from "./locale"
import { LocalePreferenceContext } from "./locale-preference-context"

interface Account {
    id: string
    preferredLocale: string | null
}
interface Selection {
    locale: AppLocale
    accountId: string | undefined
}
interface AccountLocaleProviderProps {
    account: Account | undefined
    authStatus: AuthStatus
    accountError: boolean
    queryKey: QueryKey
    preserveCurrentLocale?: boolean
    saveLocale: (locale: AppLocale, expectedAccountId: string) => Promise<unknown>
    children: ReactNode
}

function useLocaleSelection(
    { account, authStatus, preserveCurrentLocale, queryKey }: AccountLocaleProviderProps,
    i18n: I18nInstance,
    mutate: (selection: { locale: AppLocale; accountId: string }) => void,
    reset: () => void,
) {
    const client = useQueryClient()
    const selection = useRef<Selection | undefined>(undefined)
    const restored = useRef<string | undefined>(undefined)
    useEffect(() => {
        if (authStatus === "guest") {
            restored.current = undefined
            selection.current = undefined
            return
        }
        if (authStatus !== "authed" || !account || restored.current === account.id) return
        restored.current = account.id
        reset()
        const pending = selection.current
        if (pending && (pending.accountId === undefined || pending.accountId === account.id)) {
            selection.current = { ...pending, accountId: account.id }
            mutate({ locale: pending.locale, accountId: account.id })
            return
        }
        selection.current = undefined
        if (!isAppLocale(account.preferredLocale)) return
        writeLocaleCookie(account.preferredLocale)
        if (!preserveCurrentLocale) void i18n.changeLanguage(account.preferredLocale)
    }, [account, authStatus, preserveCurrentLocale, i18n, mutate, reset])
    const selectLocale = useCallback(
        (locale: AppLocale) => {
            if (authStatus === "guest") {
                reset()
                return
            }
            selection.current = {
                locale,
                accountId: authStatus === "authed" ? account?.id : undefined,
            }
            if (authStatus === "authed" && account) mutate({ locale, accountId: account.id })
        },
        [account, authStatus, mutate, reset],
    )
    const retry = useCallback(() => {
        const pending = selection.current
        if (account && pending && pending.accountId === account.id) {
            mutate({ locale: pending.locale, accountId: account.id })
        } else {
            void client.invalidateQueries({ queryKey })
        }
    }, [account, client, queryKey, mutate])
    return { selectLocale, retry }
}

export function AccountLocaleProvider(props: AccountLocaleProviderProps) {
    const { account, authStatus, accountError, queryKey, saveLocale, children } = props
    const { i18n } = useTranslation()
    const client = useQueryClient()
    const { mutate, reset, isError, isPending } = useMutation({
        mutationFn: (choice: { locale: AppLocale; accountId: string }) =>
            saveLocale(choice.locale, choice.accountId),
        scope: { id: "account-locale:" + (account?.id ?? "unknown") },
        meta: { silentError: true, invalidates: [queryKey] },
        onError: () => {
            void client.invalidateQueries({ queryKey })
        },
    })
    const { selectLocale, retry } = useLocaleSelection(props, i18n, mutate, reset)
    const value = useMemo(
        () => ({
            selectLocale,
            failed: isError || (authStatus === "authed" && !account && accountError),
            pending: isPending,
            retry: authStatus === "authed" ? retry : undefined,
        }),
        [selectLocale, isError, authStatus, account, accountError, isPending, retry],
    )
    return <LocalePreferenceContext value={value}>{children}</LocalePreferenceContext>
}
