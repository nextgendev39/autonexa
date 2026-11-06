/**
 * The logo for the dark header bar every AutoNexa email shares. Mail apps need an absolute
 * address, and many block images until asked, so the alt text is styled to stand in for it.
 */
export function emailLogoHtml() {
  const site = (process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3003").replace(/\/$/, "");
  return `<img src="${site}/brand/logo-dark.png" width="120" height="32" alt="AutoNexa" style="display:block;height:32px;width:120px;border:0;color:#d4af6a;font-size:16px;font-weight:700;letter-spacing:1px">`;
}
