const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const crypto = require("crypto");
const bcrypt = require("bcryptjs");

async function main() {
  const hashedPassword = await bcrypt.hash("password123", 12);
  const user = await prisma.user.upsert({
    where: { email: "test@example.com" },
    update: { password: hashedPassword },
    create: {
      email: "test@example.com",
      name: "Test User",
      password: hashedPassword,
    },
  });

  const quota = await prisma.apiQuota.upsert({
    where: { userId: user.id },
    update: {},
    create: {
      userId: user.id,
      secretKey: "test_api_key_" + crypto.randomBytes(16).toString("hex"),
    },
  });

  console.log("Database initialized.");
  console.log("Test User Email: test@example.com");
  console.log("Test API Key:", quota.secretKey);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
