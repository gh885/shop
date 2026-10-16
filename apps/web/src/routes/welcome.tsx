import { Link, createFileRoute } from "@tanstack/react-router"
import { useT } from "#/locales/use-t"
import type { WebMessageKey, WebParamsByKey, WebTranslate } from "#/locales/messages.gen"
import { translateWeb } from "#/locales"
import { Apple, ArrowRight, Baby, Shirt, Smartphone, Sofa, Sparkles, Store } from "lucide-react"
import { m, useReducedMotion } from "motion/react"

import { Button, buttonVariants, Card, CardContent } from "@shop/ui-web"

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
                    {t("welcome.hero.line1")}
                    <br />
                    {t("welcome.hero.line2")}
                </HeroHeadline>
            }
            body={<HeroBody>{t("welcome.hero.body")}</HeroBody>}
            actions={
                <div className="flex items-center gap-4">
                    <Button
                        size="lg"
                        render={
                            <a
                                href="#categories"
                                aria-label={t("welcome.cta.browse")}
                            />
                        }
                    >
                        {t("welcome.cta.browse")}
                        <ArrowRight className="size-4" />
                    </Button>
                    <Link
                        to="/sell"
                        className={buttonVariants({ variant: "outline", size: "lg" })}
                    >
                        {t("welcome.cta.openShop")}
                    </Link>
                </div>
            }
            images={[
                {
                    src: "https://picsum.photos/seed/home-market/640/800",
                    alt: t("welcome.hero.imageAlt.market"),
                },
                {
                    src: "https://picsum.photos/seed/home-crafts/640/480",
                    alt: t("welcome.hero.imageAlt.crafts"),
                },
                {
                    src: "https://picsum.photos/seed/home-fresh/640/480",
                    alt: t("welcome.hero.imageAlt.fresh"),
                },
            ]}
        />
    )
}

const CATEGORIES = [
    { id: "apparel", nameKey: "welcome.categories.apparel.name", icon: Shirt },
    { id: "digital", nameKey: "welcome.categories.digital.name", icon: Smartphone },
    { id: "beauty", nameKey: "welcome.categories.beauty.name", icon: Sparkles },
    { id: "home", nameKey: "welcome.categories.home.name", icon: Sofa },
    { id: "food", nameKey: "welcome.categories.food.name", icon: Apple },
    { id: "baby", nameKey: "welcome.categories.baby.name", icon: Baby },
] as const satisfies readonly { id: string; nameKey: WebMessageKey; icon: unknown }[]

const SUBS: Record<
    (typeof CATEGORIES)[number]["id"],
    readonly Exclude<WebMessageKey, keyof WebParamsByKey>[]
> = {
    apparel: [
        "welcome.categories.apparel.subs.0",
        "welcome.categories.apparel.subs.1",
        "welcome.categories.apparel.subs.2",
        "welcome.categories.apparel.subs.3",
    ],
    digital: [
        "welcome.categories.digital.subs.0",
        "welcome.categories.digital.subs.1",
        "welcome.categories.digital.subs.2",
    ],
    beauty: [
        "welcome.categories.beauty.subs.0",
        "welcome.categories.beauty.subs.1",
        "welcome.categories.beauty.subs.2",
    ],
    home: [
        "welcome.categories.home.subs.0",
        "welcome.categories.home.subs.1",
        "welcome.categories.home.subs.2",
    ],
    food: [
        "welcome.categories.food.subs.0",
        "welcome.categories.food.subs.1",
        "welcome.categories.food.subs.2",
    ],
    baby: [
        "welcome.categories.baby.subs.0",
        "welcome.categories.baby.subs.1",
        "welcome.categories.baby.subs.2",
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
            className="scroll-mt-20 bg-background"
        >
            <div className="mx-auto w-full max-w-6xl px-4 py-24">
                <SectionTitle>{t("welcome.categories.title")}</SectionTitle>
                <p className="mt-2 text-muted-foreground">{t("welcome.categories.body")}</p>

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
            <Reveal className="flex flex-col items-start gap-4 rounded-lg bg-primary-subtle p-8 md:flex-row md:items-center md:justify-between">
                <div className="flex items-start gap-4">
                    <Store className="mt-1 size-8 shrink-0 text-primary" />
                    <div className="space-y-1">
                        <h2 className="text-2xl font-bold text-primary-subtle-foreground">
                            {t("welcome.footerCta.title")}
                        </h2>
                        <p className="text-primary-subtle-foreground/80">
                            {t("welcome.footerCta.body")}
                        </p>
                    </div>
                </div>
                <Button
                    size="lg"
                    render={<Link to="/sell" />}
                >
                    {t("welcome.footerCta.cta")}
                    <ArrowRight className="size-4" />
                </Button>
            </Reveal>
        </section>
    )
}
