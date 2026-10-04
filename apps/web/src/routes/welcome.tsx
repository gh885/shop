import { Link, createFileRoute } from "@tanstack/react-router"
import { useT } from "#/locales/use-t"
import type { WebMessageKey, WebParamsByKey, WebTranslate } from "#/locales/messages.gen"
import { translateWeb } from "#/locales"
import { Apple, ArrowRight, Baby, Shirt, Smartphone, Sofa, Sparkles, Store } from "lucide-react"
import { m, useReducedMotion } from "motion/react"

import { buttonVariants, Card, CardContent } from "@shop/ui-web"

import {
    HeroBody,
    HeroHeadline,
    LandingHero,
    LandingMotion,
    Reveal,
    SectionTitle,
    STAGGER,
} from "#/shared/ui/landing"

export const Route = createFileRoute("/welcome")({
    component: Home,
    head: ({ match }) => ({
        meta: [{ title: translateWeb("app.title", match.context.locale) }],
    }),
})

function Home() {
    return (
        <LandingMotion>
            <div>
                <Hero />
                <Categories />
                <SellerBanner />
            </div>
        </LandingMotion>
    )
}

function Hero() {
    const t = useT()
    return (
        <LandingHero
            headline={
                <HeroHeadline>
                    {t("web.welcome.hero.line1")}
                    <br />
                    {t("web.welcome.hero.line2")}
                </HeroHeadline>
            }
            body={<HeroBody>{t("web.welcome.hero.body")}</HeroBody>}
            actions={
                <div className="flex items-center gap-4">
                    <a
                        href="#categories"
                        className={buttonVariants({ size: "lg" })}
                    >
                        {t("web.welcome.cta.browse")}
                        <ArrowRight className="size-4" />
                    </a>
                    <Link
                        to="/sell"
                        className={buttonVariants({ variant: "outline", size: "lg" })}
                    >
                        {t("web.welcome.cta.openShop")}
                    </Link>
                </div>
            }
            images={[
                {
                    src: "https://picsum.photos/seed/home-market/640/800",
                    alt: t("web.welcome.hero.imageAlt.market"),
                },
                {
                    src: "https://picsum.photos/seed/home-crafts/640/480",
                    alt: t("web.welcome.hero.imageAlt.crafts"),
                },
                {
                    src: "https://picsum.photos/seed/home-fresh/640/480",
                    alt: t("web.welcome.hero.imageAlt.fresh"),
                },
            ]}
        />
    )
}

/**
 * 六个类目：表里只留 **id + 图标**，名字与子类走 catalog（`web.welcome.categories.<id>.name` /
 * `.subs.<i>`）。判据同 sell 那张 MODES 表——形状重复就该收成一张表，而表里存 key 不存句子。
 * 子类用下标当槽位（`subs.0/1/2`）：它们是「这一类下面那几项」，顺序是内容的一部分，
 * 按下标编号比给每项起名字更贴近它改动的方式（增删一项就是改长度）。
 */
/**
 * 六个类目：表里是 **id + 图标 + nameKey**（key 字面量，不是句子）。
 * 名字的 key 写在表里而不是由 id 拼出来，是为了 §10.1 那条「未使用的 key」门禁看得见它——
 * 模板拼出来的 key 门禁一条都认不到。新增一类忘了配文案时，这里是类型错误。
 */
const CATEGORIES = [
    { id: "apparel", nameKey: "web.welcome.categories.apparel.name", icon: Shirt },
    { id: "digital", nameKey: "web.welcome.categories.digital.name", icon: Smartphone },
    { id: "beauty", nameKey: "web.welcome.categories.beauty.name", icon: Sparkles },
    { id: "home", nameKey: "web.welcome.categories.home.name", icon: Sofa },
    { id: "food", nameKey: "web.welcome.categories.food.name", icon: Apple },
    { id: "baby", nameKey: "web.welcome.categories.baby.name", icon: Baby },
] as const satisfies readonly { id: string; nameKey: WebMessageKey; icon: unknown }[]

/**
 * 把「子类」按 id 显式列出来，而不是按 `subCount` 现拼 `subs.${i}`。
 *
 * 判据是 i18n.md §10.1 那条「未使用的 key」门禁：它扫的是源码里**带引号的 key 整串**，
 * 模板拼出来的 key 一条都认不到，于是 catalog 里那几条会逐条报成「没人用」——而它们明明在用。
 * 显式列出既让门禁看得见，也让「这个类目下面到底有几项、分别是什么」在源码里是一眼可数的清单，
 * 而不是靠 catalog 里那几条的下标推断。键名写错同样是类型错误。
 */
const SUBS: Record<
    (typeof CATEGORIES)[number]["id"],
    readonly Exclude<WebMessageKey, keyof WebParamsByKey>[]
> = {
    apparel: [
        "web.welcome.categories.apparel.subs.0",
        "web.welcome.categories.apparel.subs.1",
        "web.welcome.categories.apparel.subs.2",
        "web.welcome.categories.apparel.subs.3",
    ],
    digital: [
        "web.welcome.categories.digital.subs.0",
        "web.welcome.categories.digital.subs.1",
        "web.welcome.categories.digital.subs.2",
    ],
    beauty: [
        "web.welcome.categories.beauty.subs.0",
        "web.welcome.categories.beauty.subs.1",
        "web.welcome.categories.beauty.subs.2",
    ],
    home: [
        "web.welcome.categories.home.subs.0",
        "web.welcome.categories.home.subs.1",
        "web.welcome.categories.home.subs.2",
    ],
    food: [
        "web.welcome.categories.food.subs.0",
        "web.welcome.categories.food.subs.1",
        "web.welcome.categories.food.subs.2",
    ],
    baby: [
        "web.welcome.categories.baby.subs.0",
        "web.welcome.categories.baby.subs.1",
        "web.welcome.categories.baby.subs.2",
    ],
}

function categoryCopy(id: (typeof CATEGORIES)[number]["id"], t: WebTranslate) {
    return { subs: SUBS[id].map((key) => t(key)) }
}

function Categories() {
    const t = useT()
    const reduce = useReducedMotion()

    return (
        <section
            id="categories"
            className="scroll-mt-20 bg-sunken"
        >
            <div className="mx-auto w-full max-w-6xl px-4 py-24">
                <SectionTitle>{t("web.welcome.categories.title")}</SectionTitle>
                <p className="mt-2 text-muted-foreground">{t("web.welcome.categories.body")}</p>

                <div className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-3">
                    {CATEGORIES.map((entry, i) => {
                        const cat = {
                            ...entry,
                            name: t(entry.nameKey),
                            ...categoryCopy(entry.id, t),
                        }
                        return (
                            <m.div
                                key={cat.name}
                                className="group"
                                custom={i}
                                variants={STAGGER}
                                initial={reduce ? false : "hidden"}
                                whileInView="show"
                                viewport={{ once: true, amount: 0.2 }}
                            >
                                <Card className="transition-transform duration-200 hover:-translate-y-1">
                                    <CardContent>
                                        <cat.icon className="size-6 text-muted-foreground transition-transform duration-200 group-hover:scale-110" />
                                        <h3 className="mt-4 font-semibold">{cat.name}</h3>
                                        <p className="mt-1 text-muted-foreground">
                                            {cat.subs.join(" / ")}
                                        </p>
                                    </CardContent>
                                </Card>
                            </m.div>
                        )
                    })}
                </div>
            </div>
        </section>
    )
}

function SellerBanner() {
    const t = useT()
    return (
        <section className="mx-auto w-full max-w-6xl px-4 py-24">
            <Reveal className="flex flex-col items-start gap-4 rounded-xl bg-primary-subtle p-8 md:flex-row md:items-center md:justify-between">
                <div className="flex items-start gap-4">
                    <Store className="mt-1 size-8 shrink-0 text-primary" />
                    <div className="space-y-1">
                        <h2 className="text-2xl font-bold text-primary-subtle-foreground">
                            {t("web.welcome.footerCta.title")}
                        </h2>
                        <p className="text-primary-subtle-foreground/80">
                            {t("web.welcome.footerCta.body")}
                        </p>
                    </div>
                </div>
                <Link
                    to="/sell"
                    className={buttonVariants({ size: "lg" })}
                >
                    {t("web.welcome.footerCta.cta")}
                    <ArrowRight className="size-4" />
                </Link>
            </Reveal>
        </section>
    )
}
