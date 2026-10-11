/** The limits of the contact form. Free of imports so the browser form can read them without the validation library. */
export const contactPolicy = {
  minName: 2,
  maxName: 100,
  maxEmail: 254,
  minSubject: 3,
  maxSubject: 150,
  minBody: 10,
  maxBody: 4_000,
  pageSize: 30,
  maxPageSize: 100,
  /** One network may send this many messages per `requesterWindowMinutes`, the whole site this many per hour. */
  requesterLimit: 5,
  requesterWindowMinutes: 10,
  siteLimit: 100,
} as const;
