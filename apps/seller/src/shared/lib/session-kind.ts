import { useSyncExternalStore } from "react"

const STORAGE_KEY = "shop_seller_session_kind"

export type SessionKind = "owner" | "subaccount"

const listeners = new Set<() => void>()

function emit(): void {
    for (const listener of listeners) listener()
}

export function getSessionKind(): SessionKind {
    if (typeof localStorage === "undefined") return "owner"
    return localStorage.getItem(STORAGE_KEY) === "subaccount" ? "subaccount" : "owner"
}

export function setSessionKind(kind: SessionKind): void {
    try {
        localStorage.setItem(STORAGE_KEY, kind)
    } finally {
        emit()
    }
}

export function clearSessionKind(): void {
    try {
        localStorage.removeItem(STORAGE_KEY)
    } finally {
        emit()
    }
}

export function subscribeSessionKind(listener: () => void): () => void {
    listeners.add(listener)
    return () => {
        listeners.delete(listener)
    }
}

export function useSessionKind(): SessionKind {
    return useSyncExternalStore(subscribeSessionKind, getSessionKind, () => "owner")
}

export function isSubaccountSession(): boolean {
    return getSessionKind() === "subaccount"
}
