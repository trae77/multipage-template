// Single switches (mirror Big Foot src/featureFlags.ts).
// SHOW_REAL_LOGINS=false: no visible "Owner login" link anywhere. /owner/ still exists and stays behind Cloudflare Access.
export const SHOW_REAL_LOGINS = false;
// SHOW_DEMO_NAV=true: "Owner demo" + "Client demo" links in the main menu of every preview (William via CEO, Oct 30:
// "always add them for previews. We want the clients to preview everything"). The real /owner/ is never linked.
export const SHOW_DEMO_NAV = true;
