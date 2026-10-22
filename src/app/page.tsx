import { LandingNav } from "@/components/landing/LandingNav";
import {
  CtaBanner,
  FaqSection,
  Features,
  Footer,
  Hero,
  HowItWorks,
  Pricing,
  PrivacyBand,
  ReportShowcase,
} from "@/components/landing/Sections";
import { getPublicInfo } from "@/lib/api/public";

export const revalidate = 300;

export default async function LandingPage() {
  const info = await getPublicInfo();
  return (
    <>
      <LandingNav />
      <main id="konten">
        <Hero trial={info.trial_enabled} />
        <Features />
        <ReportShowcase />
        <HowItWorks />
        <PrivacyBand />
        <Pricing info={info} />
        <FaqSection whatsapp={info.whatsapp} />
        <CtaBanner trial={info.trial_enabled} />
      </main>
      <Footer whatsapp={info.whatsapp} />
    </>
  );
}
