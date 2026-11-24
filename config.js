// MaaPushti settings.
// Paste your Supabase project URL and anon public key here (Supabase > Project Settings > API).
// Leave them empty to run in TEST MODE: sample data stays only in this browser.
window.MAAPUSHTI_CONFIG = {
  SUPABASE_URL: "https://sibrknfvezbylsickllc.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_MhaoJfVdBgNZYKwLtxK6sA_I8yIsCy3",
  // Logins use phone numbers; internally each phone becomes <phone>@<this domain>.
  LOGIN_DOMAIN: "maapushti.app",
  // Video and audio consultations open a free Jitsi Meet room.
  MEET_BASE: "https://meet.jit.si/",
  // Country code added to local numbers for click-to-call (Bangladesh = +88).
  COUNTRY_CODE: "+88"
};
