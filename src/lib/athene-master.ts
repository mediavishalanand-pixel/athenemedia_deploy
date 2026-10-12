import { findChannelByAlias, normalizeChannelKey } from "./channel-match";

export type ChannelMaster = {

  id: string;
  channelName: string;
  legalCompanyName: string;
  address: string;
  city: string;
  state: string;
  stateCode: string;
  pan: string;
  gstin: string;
  aliases: string[];
};

export const company = {
  companyName: "athene advertising private limited",
  footerName: "Athene Advertising Private Limited",
  address: "4/2A, Mariamman Kovil Street, Annai Sathya Nagar,",
  city: "Ganapathy, Coimbatore - 641 006",
  state: "Tamilnadu",
  stateCode: "33",
  pan: "ABACA3372K",
  cin: "U74103TN2024PTC168422",
  gstin: "33ABACA3372K1ZT",
  hsnSac: "TV RELEASE - 998364",
  placeOfSupply: "Tamilnadu, 33",
  phone: "+91 90 47 47 77 33 / 44",
  email: "media@atheneadvertising.com",
  website: "www.atheneadvertising.com",
  footerAddress:
    "No 4/2A, First Floor, Mariamman Kovil Street, Annai Sathya Nagar, Ganapathy, Coimbatore - 641006",
  defaultRemarks:
    "1. No two ads / same ad back to back should be telecast in the same commercial break. 2. No competitor ad should be telecast in the same break. 3. Request to place the spot as the first/last spot in the break. 4. Any deviations from the above to be informed and approval in writing to be obtained. 5. Bill(s) for this release order should be sent on or before 5th of the next month; any bills beyond the stipulated time will not be accepted. 6. Bill(s) should be sent to our communication address - Athene Advertising Private Limited, 4/4, First Floor, Mariamman Kovil Street, Annai Sathya Nagar, Near Moore Market, Coimbatore - 641006, Mobile: 9047477733.",
};

export const channelMaster: ChannelMaster[] = [
  {
    id: "polimer-news",
    channelName: "Polimer News",
    legalCompanyName: "POLIMER MEDIA PRIVATE LIMITED",
    address: "Old No.24, New No.30, 1st Street, Balaji Nagar,",
    city: "Chennai - 600 014",
    state: "Tamilnadu",
    stateCode: "33",
    pan: "AAACN1335Q",
    gstin: "33AAACN1335Q2ZE",
    aliases: ["Polimer", "Polimer TV", "PolimerNews", "Polimer News Tamil"],
  },
  {
    id: "sun-news",
    channelName: "Sun News",
    legalCompanyName: "SUN TV NETWORK LIMITED",
    address: "Murasoli Maran Towers, 73 MRC Nagar Main Road,",
    city: "Chennai - 600 028",
    state: "Tamilnadu",
    stateCode: "33",
    pan: "AAECS8660H",
    gstin: "33AAECS8660H1ZV",
    aliases: ["Sun News Tamil", "SunNews"],
  },
  {
    id: "sun-tv",
    channelName: "Sun TV",
    legalCompanyName: "SUN TV NETWORK LIMITED",
    address: "Murasoli Maran Towers, 73 MRC Nagar Main Road,",
    city: "Chennai - 600 028",
    state: "Tamilnadu",
    stateCode: "33",
    pan: "AAECS8660H",
    gstin: "33AAECS8660H1ZV",
    aliases: ["SunTV", "Sun Television"],
  },
  {
    id: "news18-tamil-nadu",
    channelName: "News18 Tamil Nadu",
    legalCompanyName: "NETWORK18 MEDIA & INVESTMENTS LIMITED",
    address: "Express Towers, Nariman Point,",
    city: "Mumbai - 400 021",
    state: "Maharashtra",
    stateCode: "27",
    pan: "AAACN3554G",
    gstin: "27AAACN3554G1ZM",
    aliases: ["News18 Tamil", "News18 TN", "News 18 Tamil Nadu"],
  },
  {
    id: "thanthi-tv",
    channelName: "Thanthi TV",
    legalCompanyName: "THANTHI TELEVISION PRIVATE LIMITED",
    address: "86, EVR Periyar Salai, Kilpauk,",
    city: "Chennai - 600 010",
    state: "Tamilnadu",
    stateCode: "33",
    pan: "AACCT9403P",
    gstin: "33AACCT9403P1ZR",
    aliases: ["Thanthi", "Dina Thanthi TV", "ThanthiTV"],
  },
  {
    id: "puthiya-thalaimurai",
    channelName: "Puthiya Thalaimurai",
    legalCompanyName: "PUTHIYA THALAIMURAI TELEVISION PRIVATE LIMITED",
    address: "No.6, Vaidyaraman Street, T Nagar,",
    city: "Chennai - 600 017",
    state: "Tamilnadu",
    stateCode: "33",
    pan: "AAECP6478D",
    gstin: "33AAECP6478D1ZK",
    aliases: ["Puthiya Thalaimurai TV", "PT TV", "PuthiyaThalaimurai"],
  },
  {
    id: "zee-tamil",
    channelName: "Zee Tamil",
    legalCompanyName: "ZEE ENTERTAINMENT ENTERPRISES LIMITED",
    address: "18th Floor, A Wing, Marathon Futurex, N M Joshi Marg,",
    city: "Mumbai - 400 013",
    state: "Maharashtra",
    stateCode: "27",
    pan: "AAACZ0243Q",
    gstin: "27AAACZ0243Q1ZO",
    aliases: ["ZeeTamil", "Zee Tamizh"],
  },
];

export const normalizeKey = normalizeChannelKey;

export function matchChannel(name: string): ChannelMaster | undefined {
  return findChannelByAlias(name, channelMaster, (channel) => [
    channel.channelName,
    ...channel.aliases,
  ]);
}


export function fallbackChannel(name: string): ChannelMaster {
  return {
    id: `unmapped-${normalizeKey(name) || "channel"}`,
    channelName: name,
    legalCompanyName: name.toUpperCase(),
    address: "Address not available in channel master",
    city: "",
    state: company.state,
    stateCode: company.stateCode,
    pan: "",
    gstin: "",
    aliases: [],
  };
}

export const money = (value: number) =>
  value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const plainNumber = (value: number) =>
  Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));

export function amountInWords(value: number): string {
  const ones = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
    "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen",
    "Eighteen", "Nineteen",
  ];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const underThousand = (amount: number): string => {
    if (amount < 20) return ones[amount] ?? "";
    if (amount < 100)
      return `${tens[Math.floor(amount / 10)]}${amount % 10 ? ` ${ones[amount % 10]}` : ""}`;
    return `${ones[Math.floor(amount / 100)]} Hundred${amount % 100 ? ` ${underThousand(amount % 100)}` : ""}`;
  };
  const integer = Math.round(Math.max(0, value));
  const parts = [
    integer >= 10000000 ? `${underThousand(Math.floor(integer / 10000000))} Crore` : "",
    integer % 10000000 >= 100000
      ? `${underThousand(Math.floor((integer % 10000000) / 100000))} Lakh`
      : "",
    integer % 100000 >= 1000 ? `${underThousand(Math.floor((integer % 100000) / 1000))} Thousand` : "",
    integer % 1000 ? underThousand(integer % 1000) : "",
  ].filter(Boolean);
  return `Rupees ${parts.join(" ") || "Zero"} Only`;
}
