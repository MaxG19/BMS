import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({
  adapter,
});

const permissions = [
  "PRODUCTS_READ",
  "PRODUCTS_MANAGE",
  "INVENTORY_READ",
  "INVENTORY_MANAGE",
  "SALES_READ",
  "SALES_CREATE",
  "SALES_MANAGE",
  "CUSTOMERS_READ",
  "CUSTOMERS_MANAGE",
  "SUPPLIERS_READ",
  "SUPPLIERS_MANAGE",
  "PURCHASE_ORDERS_READ",
  "PURCHASE_ORDERS_MANAGE",
  "REPORTS_READ",
  "USERS_READ",
  "USERS_MANAGE",
  "BUSINESS_SETTINGS_MANAGE",
];

const rolePermissions: Record<string, string[]> = {
  OWNER: permissions,

  MANAGER: [
    "PRODUCTS_READ",
    "PRODUCTS_MANAGE",
    "INVENTORY_READ",
    "INVENTORY_MANAGE",
    "SALES_READ",
    "SALES_CREATE",
    "SALES_MANAGE",
    "CUSTOMERS_READ",
    "CUSTOMERS_MANAGE",
    "SUPPLIERS_READ",
    "SUPPLIERS_MANAGE",
    "PURCHASE_ORDERS_READ",
    "PURCHASE_ORDERS_MANAGE",
    "REPORTS_READ",
  ],

  CASHIER: [
    "PRODUCTS_READ",
    "INVENTORY_READ",
    "SALES_READ",
    "SALES_CREATE",
    "CUSTOMERS_READ",
    "CUSTOMERS_MANAGE",
  ],
};

async function main() {
  console.log("Starting database seed...");

  // Create permissions
  const permissionRecords = new Map<string, { id: string }>();

  for (const name of permissions) {
    const permission = await prisma.permission.upsert({
      where: { name },
      update: {},
      create: { name },
      select: { id: true },
    });

    permissionRecords.set(name, permission);
  }

  // Create roles and role-permission mappings
  for (const [roleName, permissionNames] of Object.entries(rolePermissions)) {
    const role = await prisma.role.upsert({
      where: { name: roleName },
      update: {},
      create: { name: roleName },
      select: { id: true },
    });

    for (const permissionName of permissionNames) {
      const permission = permissionRecords.get(permissionName);

      if (!permission) {
        throw new Error(
          `Permission "${permissionName}" was not created.`,
        );
      }

      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: role.id,
            permissionId: permission.id,
          },
        },
        update: {},
        create: {
          roleId: role.id,
          permissionId: permission.id,
        },
      });
    }
  }

  console.log("Database seed completed successfully.");
}

main()
  .catch((error) => {
    console.error("Database seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });