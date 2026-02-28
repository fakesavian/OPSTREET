import { PrismaClient } from "@prisma/client";
import { slugify } from "@opfun/shared";

const prisma = new PrismaClient();

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

  console.log("Seed complete.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
