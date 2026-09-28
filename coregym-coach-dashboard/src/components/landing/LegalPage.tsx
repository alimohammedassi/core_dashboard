"use client";

import Image from "next/image";
import Link from "next/link";
import { Grain, LandingProvider, useLanding } from "./ui";

export type LegalSection = {
  heading: string;
  paragraphs?: string[];
  list?: string[];
};

export type LegalContent = {
  title: string;
  intro: string;
  updated: string;
  sections: LegalSection[];
};

function LegalShell({ content }: { content: Record<"en" | "ar", LegalContent> }) {
  const { lang, setLang } = useLanding();
  const t = content[lang];
  const rtl = lang === "ar";

  return (
    <div
      dir={rtl ? "rtl" : "ltr"}
      className={`min-h-svh bg-[#0a0b08] text-[#eceee2] ${rtl ? "font-arabic" : "font-sans"}`}
    >
      <Grain />
      <header className="border-b border-white/[0.06]">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-6 py-5">
          <Link href="/" className="shrink-0" aria-label={rtl ? "الصفحة الرئيسية لـ CoreGym" : "CoreGym home"}>
            <Image src="/landing/logo.png" alt="CoreGym" width={980} height={280} className="h-6 w-auto" />
          </Link>
          <div className="flex items-center gap-3">
            <div className="flex rounded-full border border-white/10 p-0.5 text-xs font-semibold">
              {(["en", "ar"] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLang(l)}
                  className={`rounded-full px-3 py-1 uppercase transition-colors ${
                    lang === l ? "bg-volt text-black" : "text-white/50 hover:text-white/80"
                  }`}
                >
                  {l === "en" ? "EN" : "ع"}
                </button>
              ))}
            </div>
            <Link
              href="/"
              className="text-xs text-white/40 transition-colors hover:text-volt"
            >
              {rtl ? "← الرئيسية" : "← Home"}
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-14">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t.title}</h1>
        <p className="mt-2 text-xs text-white/40">{t.updated}</p>
        <p className="mt-6 leading-relaxed text-white/70">{t.intro}</p>

        <div className="mt-12 space-y-12">
          {t.sections.map((section) => (
            <section key={section.heading}>
              <h2 className="text-lg font-bold text-volt">{section.heading}</h2>
              {section.paragraphs?.map((p, i) => (
                <p key={i} className="mt-4 leading-relaxed text-white/70">
                  {p}
                </p>
              ))}
              {section.list ? (
                <ul className="mt-4 space-y-2">
                  {section.list.map((item, i) => (
                    <li key={i} className="flex gap-3 leading-relaxed text-white/70">
                      <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-volt" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}
        </div>
      </main>

      <footer className="border-t border-white/[0.06] py-6 text-center text-xs text-white/30">
        © {new Date().getFullYear()} CoreGym
      </footer>
    </div>
  );
}

export function LegalPage({ content }: { content: Record<"en" | "ar", LegalContent> }) {
  return (
    <LandingProvider>
      <LegalShell content={content} />
    </LandingProvider>
  );
}
