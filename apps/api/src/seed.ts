import { PrismaClient } from "@prisma/client";
import { slugify } from "@opfun/shared";
import { seedFoundationData } from "./services/foundation.js";

const prisma = new PrismaClient();

const AVATAR_CATALOG = [
  { id: "default-free-1", name: "Rocket",       emoji: "🚀", bgColor: "bg-blue-600",   tier: "FREE",        pricePoints: 0,   unlockCondition: null,               description: "The classic launchpad rocket.",   sortOrder: 1 },
  { id: "default-free-2", name: "Fire",          emoji: "🔥", bgColor: "bg-orange-600", tier: "FREE",        pricePoints: 0,   unlockCondition: null,               description: "Hot takes only.",                 sortOrder: 2 },
  { id: "default-free-3", name: "Diamond",       emoji: "💎", bgColor: "bg-cyan-600",   tier: "FREE",        pricePoints: 0,   unlockCondition: null,               description: "Diamond hands. Always.",          sortOrder: 3 },
  { id: "default-free-4", name: "Moon",          emoji: "🌙", bgColor: "bg-indigo-700", tier: "FREE",        pricePoints: 0,   unlockCondition: null,               description: "To the moon and back.",           sortOrder: 4 },
  { id: "achievement-founder", name: "Founder",  emoji: "👑", bgColor: "bg-yellow-600", tier: "ACHIEVEMENT", pricePoints: 0,   unlockCondition: "tokens_created_1", description: "Launched your first token.",      sortOrder: 5 },
  { id: "achievement-caller", name: "Alpha Caller", emoji: "📡", bgColor: "bg-green-700", tier: "ACHIEVEMENT", pricePoints: 0, unlockCondition: "callouts_10",      description: "Posted 10 alpha callouts.",       sortOrder: 6 },
  { id: "achievement-og",  name: "OG",           emoji: "⭐", bgColor: "bg-purple-700", tier: "ACHIEVEMENT", pricePoints: 0,   unlockCondition: "callouts_50",      description: "Veteran of 50 callouts.",         sortOrder: 7 },
  { id: "paid-degen",      name: "Degen",        emoji: "🎰", bgColor: "bg-red-700",    tier: "PAID",        pricePoints: 100, unlockCondition: null,               description: "Full degen mode activated.",      sortOrder: 8 },
  { id: "paid-whale",      name: "Whale",        emoji: "🐋", bgColor: "bg-blue-800",   tier: "PAID",        pricePoints: 500, unlockCondition: null,               description: "Big moves only.",                 sortOrder: 9 },
  { id: "paid-laser",      name: "Laser Eyes",   emoji: "👀", bgColor: "bg-rose-600",   tier: "PAID",        pricePoints: 250, unlockCondition: null,               description: "Laser-focused on alpha.",         sortOrder: 10 },
];

async function main() {
  const slug = slugify("opfun-demo-OPD");
  await prisma.project.upsert({
    where: { slug },
    update: {},
    create: {
      slug,
      name: "OPFun Demo",
      ticker: "OPD",
      decimals: 18,
      maxSupply: "1000000000",
      description:
        "A demo project seeded during development. Fixed supply, no mint, no admin keys. Safe defaults only.",
      linksJson: JSON.stringify({ website: "https://opnet.org" }),
      status: "DRAFT",
      network: "testnet",
    },
  });

  // Seed avatar catalog
  for (const avatar of AVATAR_CATALOG) {
    await prisma.avatarCatalog.upsert({
      where: { id: avatar.id },
      update: avatar,
      create: avatar,
    });
  }

  await seedFoundationData();

  console.log("Seed complete.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
