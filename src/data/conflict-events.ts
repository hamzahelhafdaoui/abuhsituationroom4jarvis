/** Shipped citations. Not a live ACLED/UCDP pull. Coordinates are the published place, not a news centroid. */
export interface ConflictCite {
  id: string;
  dataset: "shipped-citation";
  date: string;
  eventType: string;
  location: string;
  lat: number;
  lon: number;
  sourceLabel: string;
  sourceUrl: string;
  note: string;
}

export const CONFLICT_CITES: ConflictCite[] = [
  {
    id: "cite-wadi-sayyidna-2026-08-14",
    dataset: "shipped-citation",
    date: "2026-08-14",
    eventType: "published damage imagery",
    location: "Wadi Sayyidna Airbase",
    lat: 15.9625,
    lon: 32.5525,
    sourceLabel: "@AfriMEOSINT",
    sourceUrl: "https://x.com/AfriMEOSINT",
    note: "Ingested published post. Not an AHSR assessment. Not verified by AHSR. Corroboration only.",
  },
  {
    id: "cite-asosa-il76-2026-09-07",
    dataset: "shipped-citation",
    date: "2026-09-07",
    eventType: "published airframe imagery",
    location: "Asosa Airport",
    lat: 10.0186,
    lon: 34.586,
    sourceLabel: "@AfriMEOSINT",
    sourceUrl: "https://x.com/AfriMEOSINT",
    note: "Ingested published post. Airframe-typical only. Not an AHSR assessment.",
  },
  {
    id: "cite-bahir-dar-2026-05-30",
    dataset: "shipped-citation",
    date: "2026-05-30",
    eventType: "published apron change",
    location: "Bahir Dar Airport",
    lat: 11.6008,
    lon: 37.3217,
    sourceLabel: "@AfriMEOSINT",
    sourceUrl: "https://x.com/AfriMEOSINT",
    note: "Ingested published post. Not an AHSR assessment. Not a weapons identification.",
  },
  {
    id: "cite-el-fasher-airport",
    dataset: "shipped-citation",
    date: "2026-09-08",
    eventType: "published airfield reporting",
    location: "El Fasher Airport",
    lat: 13.6148,
    lon: 25.3246,
    sourceLabel: "AHSR archive card",
    sourceUrl: "https://x.com/AfriMEOSINT",
    note: "Place of published reporting. Not a live FLOT point. Not an AHSR assessment.",
  },
  {
    id: "cite-zamzam",
    dataset: "shipped-citation",
    date: "2026-04-11",
    eventType: "published displacement / camp reporting",
    location: "Zamzam IDP camp",
    lat: 13.482,
    lon: 25.311,
    sourceLabel: "published camp reporting",
    sourceUrl: "https://reliefweb.int/",
    note: "Humanitarian place citation. Not a strike pin. Not an AHSR assessment.",
  },
  {
    id: "cite-khartoum-intl",
    dataset: "shipped-citation",
    date: "2026-09-08",
    eventType: "published airfield reporting",
    location: "Khartoum International Airport",
    lat: 15.5895,
    lon: 32.5532,
    sourceLabel: "AHSR archive card",
    sourceUrl: "https://x.com/AfriMEOSINT",
    note: "Ingested published post. Not an AHSR assessment.",
  },
];
