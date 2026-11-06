import { MailIcon, MessageCircleIcon, NavigationIcon, PhoneIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { EnquiryForm } from "@/components/storefront/enquiry-form";
import { telLink, whatsappLink } from "@/components/storefront/labels";
import { Reveal } from "@/components/storefront/reveal";
import { ContactDetails } from "@/components/storefront/site-sections";
import type { SiteView } from "@/lib/storefront/view";

const action =
  "inline-flex h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-[filter,background-color] hover:brightness-110";

/**
 * The contact page: one-tap ways to reach the dealership up top, then the details and a message
 * form side by side. The form keeps its own height and stays in view while the details scroll.
 */
export async function ContactScreen({ view }: { view: SiteView }) {
  const t = await getTranslations("storefront");
  await view.track("page_view", { path: "/contact" });
  const { phone, whatsapp, email, mapUrl } = view.config.contact;

  return (
    <div className="pb-16">
      <section
        className="relative isolate overflow-hidden"
        style={{ background: "var(--sf-primary)", color: "var(--sf-on-primary)" }}
      >
        <div
          className="absolute -end-24 -top-24 -z-10 size-80 rounded-full opacity-25 blur-3xl"
          style={{ background: "var(--sf-accent)" }}
          aria-hidden
        />
        <Reveal className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-12 sm:px-6 sm:py-14">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold tracking-[0.16em] uppercase opacity-70">
              {view.name}
            </p>
            <h1 className="font-heading mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
              {t("contact.title")}
            </h1>
            <p className="mt-3 text-pretty opacity-80">{t("contact.intro")}</p>
          </div>
          {phone || whatsapp || email || mapUrl ? (
            <div className="flex flex-wrap gap-3">
              {phone ? (
                <a href={telLink(phone)} className={`${action} bg-white text-neutral-900`}>
                  <PhoneIcon className="size-4" aria-hidden />
                  {t("vehicle.call")}
                </a>
              ) : null}
              {whatsapp ? (
                <a
                  href={whatsappLink(whatsapp)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${action} bg-[#1f9d55] text-white`}
                >
                  <MessageCircleIcon className="size-4" aria-hidden />
                  {t("vehicle.whatsapp")}
                </a>
              ) : null}
              {email ? (
                <a
                  href={`mailto:${email}`}
                  className={`${action} border border-current/30 bg-current/10`}
                >
                  <MailIcon className="size-4" aria-hidden />
                  {t("contact.email")}
                </a>
              ) : null}
              {mapUrl ? (
                <a
                  href={mapUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${action} border border-current/30 bg-current/10`}
                >
                  <NavigationIcon className="size-4" aria-hidden />
                  {t("contact.directions")}
                </a>
              ) : null}
            </div>
          ) : null}
        </Reveal>
      </section>

      <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 pt-10 sm:px-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-start">
        <Reveal className="grid content-start gap-4">
          <h2 className="font-heading text-xl font-semibold">{t("contact.reachUs")}</h2>
          <ContactDetails config={view.config} locale={view.locale} layout="grid" />
        </Reveal>
        <Reveal delay={0.1} className="lg:sticky lg:top-24">
          <section
            id="message"
            className="bg-card ring-border grid gap-4 rounded-lg p-5 shadow-sm ring-1 sm:p-6"
          >
            <div>
              <h2 className="font-heading text-xl font-semibold">{t("contact.formTitle")}</h2>
              <p className="text-muted-foreground mt-1 text-sm">{t("contact.formHint")}</p>
            </div>
            <EnquiryForm
              stockNumber={null}
              locale={view.locale}
              canRequestBooking={false}
              api={view.api}
            />
          </section>
        </Reveal>
      </div>
    </div>
  );
}
