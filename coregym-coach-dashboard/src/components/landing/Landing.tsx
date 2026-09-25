"use client";

import { Grain, LandingProvider, useLanding } from "./ui";
import { Hero, Marquee, Navbar } from "./Hero";
import { AppSection } from "./AppSection";
import { CoachSection } from "./CoachSection";
import { FinalCta, Footer, HowItWorks, Stats } from "./Closing";

function Shell() {
  const { lang } = useLanding();

  return (
    <div
      dir={lang === "ar" ? "rtl" : "ltr"}
      className={`min-h-svh overflow-x-clip bg-[#0a0b08] text-[#eceee2] ${lang === "ar" ? "font-arabic" : "font-sans"}`}
    >
      <Grain />
      <Navbar />
      <main>
        <Hero />
        <Marquee />
        <AppSection />
        <CoachSection />
        <HowItWorks />
        <Stats />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}

export function Landing() {
  return (
    <LandingProvider>
      <Shell />
    </LandingProvider>
  );
}
