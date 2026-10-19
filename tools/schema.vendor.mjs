// Vendored from trae77/client-site-templates tools/v3.mjs (schema types, hours parser). Keep in sync.
// Spec v3: per-trade copy blocks, LocalBusiness JSON-LD, FAQ question banks.
// Facts only: formulas use name/city/areas/phone and owner-supplied flags; nothing else is asserted.
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** h1/sub get { name, city, areas } (already HTML-escaped). primary = hero button, sticky = 3rd bar button, service = title/meta. */
export const COPY = {
  roofing: { service: 'Roof repair & replacement', h1: (c) => `Roof repair &amp; replacement in ${c.city}`, sub: (c) => `${c.name} handles leaks, storm damage and new roofs across ${c.areas}.`, primary: 'Request an Inspection', free: 'Request a Free Inspection', sticky: 'Inspect' },
  hvac: { service: 'Heating & AC repair', h1: (c) => `Heating &amp; AC repair in ${c.city}`, sub: (c) => `Furnace, heat pump and AC service across ${c.areas}.`, primary: 'Request Service', sticky: 'Help Now' },
  plumbing: { service: 'Plumber', h1: (c) => `Plumber in ${c.city}`, sub: (c) => `Leaks, drains, water heaters and fixtures across ${c.areas}.`, primary: 'Request a Plumber', sticky: 'Help Now' },
  electrician: { service: 'Electrician', h1: (c) => `Electrician in ${c.city}`, sub: (c) => `Panels, wiring, lighting and EV chargers across ${c.areas}.`, primary: 'Request an Electrician', sticky: 'Request' },
  handyman: { service: 'Handyman', h1: (c) => `Handyman in ${c.city}`, sub: () => 'Small repairs and home projects, one list at a time.', primary: 'Send My Job List', sticky: 'Job List' },
  painting: { service: 'House painting', h1: (c) => `House painting in ${c.city}`, sub: (c) => `Interior, exterior and cabinets across ${c.areas}.`, primary: 'Get a Painting Quote', free: 'Get a Free Painting Quote', sticky: 'Quote' },
  landscaping: { service: 'Lawn care & landscaping', h1: (c) => `Lawn care &amp; landscaping in ${c.city}`, sub: (c) => `Mowing, beds, cleanups and planting across ${c.areas}.`, primary: 'Get a Yard Quote', free: 'Get a Free Yard Quote', sticky: 'Quote' },
  'cleaning-service': { service: 'House cleaning', h1: (c) => `House cleaning in ${c.city}`, sub: (c) => `Regular, deep and move-out cleaning across ${c.areas}.`, primary: 'Get My Quote', free: 'Get My Free Quote', sticky: 'Quote' },
  'pressure-washing': { service: 'Pressure washing', h1: (c) => `Pressure washing in ${c.city}`, sub: (c) => `Driveways, siding, decks and fences across ${c.areas}.`, primary: 'Get a Washing Quote', free: 'Get a Free Washing Quote', sticky: 'Quote' },
  'auto-repair': { service: 'Auto repair', h1: (c) => `Auto repair in ${c.city}`, sub: (c) => `Brakes, diagnostics, oil and tires at ${c.name}.`, primary: 'Request Service', sticky: 'Service' },
  'auto-detailing': { service: 'Car detailing', h1: (c) => `Car detailing in ${c.city}`, sub: () => 'Interior, exterior and full details.', primary: 'Pick a Package', sticky: 'Packages' },
  'salon-barber': { service: 'Haircuts & color', h1: (c) => `${c.name}: haircuts &amp; color in ${c.city}`, sub: () => 'Cuts, color, beard work and styling.', primary: 'Book Now', sticky: 'Book' },
  restaurant: { service: 'Restaurant', h1: (c) => c.name, sub: (c) => (c.cuisine ? `${c.cuisine} in ${c.city}.` : `In ${c.city}.`), primary: 'Order for Pickup', sticky: 'Order', noMoneyPrimary: 'View Menu' },
  fitness: { service: 'Fitness classes', h1: (c) => `Fitness classes in ${c.city}`, sub: () => 'New here? Start with an intro session.', primary: 'Try a Class', sticky: 'Schedule' },
  'pet-services': { service: 'Dog grooming & pet care', h1: (c) => `Dog grooming &amp; pet care in ${c.city}`, sub: () => 'Grooming, walks, sitting and training.', primary: 'Book a Groom', sticky: 'Book' },
  'dental-medical': { service: 'Dental & medical care', h1: (c) => `${c.practice} in ${c.city}`, sub: () => 'Checkups, cleanings and first visits.', primary: 'Request a Visit', sticky: 'Visit' },
  'real-estate': { service: 'Real estate', h1: (c) => `${c.name} — ${c.cityName} real estate`, sub: (c) => `Helping buyers and sellers across ${c.areas}.`, primary: "What's My Home Worth?", listingsPrimary: 'Search Homes', sticky: 'Homes' },
  photography: { service: 'Photographer', h1: (c) => `Photographer in ${c.city}`, sub: () => 'Portraits, events, weddings and headshots.', primary: 'Check My Date', sticky: 'Date' },
};

/** Most specific schema.org type per category (each checked to exist at schema.org/<Type>, 2026-10-19). */
const SCHEMA_TYPE = {
  roofing: 'RoofingContractor', hvac: 'HVACBusiness', plumbing: 'Plumber', electrician: 'Electrician', painting: 'HousePainter',
  handyman: 'HomeAndConstructionBusiness', landscaping: 'HomeAndConstructionBusiness', 'tree-service': 'HomeAndConstructionBusiness',
  concrete: 'GeneralContractor', fencing: 'GeneralContractor', 'cleaning-service': 'LocalBusiness', 'pressure-washing': 'LocalBusiness',
  'pest-control': 'LocalBusiness', moving: 'MovingCompany', 'auto-repair': 'AutoRepair', 'auto-detailing': 'AutoWash',
  'salon-barber': 'HairSalon', tattoo: 'TattooParlor', restaurant: 'Restaurant', fitness: 'ExerciseGym', 'pet-services': 'LocalBusiness',
  'dental-medical': 'Dentist', 'real-estate': 'RealEstateAgent', photography: 'ProfessionalService', daycare: 'ChildCare',
  'law-accounting': 'LegalService', church: 'Church', 'generic-business': 'LocalBusiness',
};
const SCHEMA_ALIAS = {
  'nail-salon': 'NailSalon', spa: 'DaySpa', 'beauty-salon': 'BeautySalon', 'food-truck': 'FoodEstablishment', foodtruck: 'FoodEstablishment',
  'food-trucks': 'FoodEstablishment', 'restaurant-foodtruck': 'FoodEstablishment', bakery: 'Bakery', cafe: 'CafeOrCoffeeShop', coffee: 'CafeOrCoffeeShop', pizza: 'Restaurant',
  medical: 'MedicalClinic', clinic: 'MedicalClinic', doctor: 'Physician', lawyer: 'Attorney', attorney: 'Attorney', 'law-firm': 'Attorney',
  accounting: 'AccountingService', accountant: 'AccountingService', cpa: 'AccountingService', bookkeeping: 'AccountingService', 'tax-preparation': 'AccountingService',
  gym: 'ExerciseGym', locksmith: 'Locksmith',
};
export const SCHEMA_TYPES_USED = [...new Set([...Object.values(SCHEMA_TYPE), ...Object.values(SCHEMA_ALIAS)])].sort();
export function schemaType(folder, tradeKey) { return SCHEMA_ALIAS[tradeKey] || SCHEMA_TYPE[folder] || 'LocalBusiness'; }

const DAYS = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
const ORDER = Object.keys(DAYS);
/** --hours-json '{"Mon-Fri":"08:00-17:00","Sat":"09:00-12:00"}' -> openingHoursSpecification */
export function parseHoursJson(raw) {
  let obj; try { obj = JSON.parse(raw); } catch { throw new Error('--hours-json must be JSON like {"Mon-Fri":"08:00-17:00"}'); }
  return Object.entries(obj).map(([days, span]) => {
    const dm = days.toLowerCase().match(/^([a-z]{3})(?:-([a-z]{3}))?$/); const tm = String(span).match(/^(\d{2}:\d{2})-(\d{2}:\d{2})$/);
    if (!dm || !DAYS[dm[1]] || (dm[2] && !DAYS[dm[2]]) || !tm) throw new Error(`--hours-json: bad entry "${days}": "${span}" (use "Mon-Fri": "08:00-17:00")`);
    const a = ORDER.indexOf(dm[1]); const b = dm[2] ? ORDER.indexOf(dm[2]) : a;
    return { '@type': 'OpeningHoursSpecification', dayOfWeek: ORDER.slice(a, b + 1).map((d) => DAYS[d]), opens: tm[1], closes: tm[2] };
  });
}

/** LocalBusiness JSON-LD from flags only. Never aggregateRating or review (spec v3 A3). */
export function jsonLd(ctx, cfg, folder, tradeKey) {
  const d = String(ctx.phoneDisplay).replace(/\D/g, '');
  const o = { '@context': 'https://schema.org', '@type': schemaType(folder, tradeKey), name: ctx.name };
  if (ctx.siteUrl) o.url = ctx.siteUrl;
  o.telephone = d.length === 10 ? `+1${d}` : ctx.phoneDisplay;
  if (ctx.email) o.email = ctx.email;
  o.address = { '@type': 'PostalAddress', ...(ctx.address ? { streetAddress: ctx.address } : {}), addressLocality: ctx.cityName, ...(ctx.state ? { addressRegion: ctx.state } : {}), addressCountry: 'US' };
  o.areaServed = ctx.areas.map((a) => ({ '@type': 'City', name: a }));
  if (ctx.mapCenter) o.geo = { '@type': 'GeoCoordinates', latitude: Number(ctx.mapCenter[0].toFixed(5)), longitude: Number(ctx.mapCenter[1].toFixed(5)) };
  if (ctx.hoursSpec) o.openingHoursSpecification = ctx.hoursSpec;
  if (ctx.cuisine) o.servesCuisine = ctx.cuisine;
  if (ctx.brokerage) o.parentOrganization = { '@type': 'RealEstateAgent', name: ctx.brokerage };
  o.makesOffer = cfg.services.map(([n, desc]) => ({ '@type': 'Offer', itemOffered: { '@type': 'Service', name: n, description: desc } }));
  const blocks = [o];
  if (ctx.faqSchema && ctx.faqExtra && ctx.faqExtra.length) {
    blocks.push({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: ctx.faqExtra.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) });
  }
  return blocks.map((b) => `  <script type="application/ld+json">${JSON.stringify(b).replace(/</g, '\\u003c')}</script>`).join('\n');
}

/** FAQ banks (spec v3 D). Questions only; answers must come from the owner via --faq-file. */
const SHARED = ['What areas do you serve?', 'How do I get a price?', "What's your availability?", 'How do I pay?', 'What happens after I send a request?'];
export const FAQ_BANK = {
  roofing: ['Do you do free inspections?', 'Do you work with insurance claims?', 'Repair or replace: how do I know?', 'How long does a replacement take?', 'What warranty comes with the work?', 'Do you haul away old material?'],
  trades: ['Do you offer after-hours service?', 'Is there a trip or diagnostic fee?', 'What brands do you service?', 'Do you offer maintenance plans?', 'Can you pull permits?'],
  electrician: ['Can you install EV chargers or upgrade my panel?'],
  handyman: ['What jobs are too small or too big?', 'Do you charge hourly or by the job?', 'Do I need to buy materials?'],
  painting: ['Do you move furniture?', 'What paint do you use?', 'How long does an interior room take?', 'Do you repair drywall first?', 'How do you protect floors?'],
  outdoor: ['Do you offer recurring service?', 'What happens if it rains?', 'Is pressure washing safe for my siding or roof?', 'Do I need to be home?'],
  cleaning: ["What's included in a standard vs deep clean?", 'Do I supply products?', 'Do I need to be home?', 'Is it the same cleaner each time?', "What's your cancellation policy?"],
  auto: ['Do I need to book ahead?', 'Can I wait at the shop?', 'Do you use OEM parts?', 'How long does a detail take?', 'Do you offer mobile service?'],
  salon: ['How do I book with a specific stylist?', "What's your cancellation or late policy?", 'Do you take walk-ins?', 'How long is a color visit?', 'Do I need a consultation first?'],
  restaurant: ['Do you take reservations?', 'How does pickup ordering work?', 'Do you have vegetarian, vegan or gluten-free options?', 'Do you cater?', 'Where will the truck be this week?'],
  fitness: ["I'm a beginner. Is that OK?", 'What should I bring to my first class?', 'Do I need to book ahead or can I walk in?', 'How do memberships or class packs work?', 'Can I freeze or cancel?'],
  pet: ['What vaccinations do you require?', 'How long does grooming take?', 'Do you take anxious or senior pets?'],
  medical: ['Are you accepting new patients?', 'Which insurance plans do you accept?', 'What should I bring to my first visit?', 'Do you offer payment plans?', 'What if I have a dental emergency?', 'Where do I park?'],
  'real-estate': ['How do you price a home?', 'What does it cost to sell?', 'How do I get pre-approved?', 'Can you show me homes in my area?', 'Which brokerage are you with?'],
  photography: ['How far ahead should I book?', 'Is a deposit required?', 'When do I get my photos?', 'Do you travel?', 'Can I order prints?'],
};
const BANK_FOR = {
  roofing: ['roofing'], hvac: ['trades'], plumbing: ['trades'], electrician: ['trades', 'electrician'], handyman: ['handyman'], painting: ['painting'],
  landscaping: ['outdoor'], 'pressure-washing': ['outdoor'], 'tree-service': ['outdoor'], 'cleaning-service': ['cleaning'], 'auto-repair': ['auto'], 'auto-detailing': ['auto'],
  'salon-barber': ['salon'], tattoo: ['salon'], restaurant: ['restaurant'], fitness: ['fitness'], 'pet-services': ['pet'], 'dental-medical': ['medical'],
  'real-estate': ['real-estate'], photography: ['photography'],
};
/** Bank for a category: trade questions first, then shared. "Are you licensed and insured?" only with --licensed. */
export function faqBank(folder, licensed) {
  const qs = [...(BANK_FOR[folder] || []).flatMap((k) => FAQ_BANK[k]), ...SHARED];
  if (licensed) qs.push('Are you licensed and insured?');
  return [...new Set(qs)];
}
