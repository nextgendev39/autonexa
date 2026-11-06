import { z } from "zod";

import { demoRequestStatuses } from "@/lib/platform/demo-requests";
import { emailSchema } from "@/lib/validation/index";

const required = z.string().trim().min(1);
const RESERVED_SLUGS = new Set([
  "www", "app", "admin", "api", "platform", "mail", "static", "assets", "cdn", "status",
  "support", "help", "login", "auth", "dashboard", "ns1", "ns2",
]);
const optionalText = z.string().trim().max(500).optional().nullable();
const limit = z.number().int().min(0).max(100_000_000).nullable();
const money = z.number().min(0).max(1_000_000_000);
const futureDate = z.iso.datetime({ offset: true });

export const subscriptionStartStatus = z.enum(["trialing", "active"]);
export const billingCycle = z.enum(["monthly", "yearly", "custom"]);

export const createDealershipSchema = z.object({
  name: required.max(120),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    .max(60)
    // A dealership's address is <slug>.<base>, so these would never resolve. See 00080.
    .refine((slug) => !RESERVED_SLUGS.has(slug)),
  numberPrefix: z.string().trim().regex(/^[A-Z0-9]{2,8}$/),
  planId: z.uuid(),
  status: subscriptionStartStatus,
  billingCycle,
  periodEnd: futureDate.nullable(),
  ownerEmail: emailSchema,
  ownerFirstName: required.max(80),
  ownerLastName: required.max(80),
});

export const inviteOwnerSchema = z.object({
  ownerEmail: emailSchema,
  ownerFirstName: required.max(80),
  ownerLastName: required.max(80),
});

export const updateDealershipSchema = z.object({
  name: required.max(120),
  displayName: optionalText,
  logoUrl: z.string().trim().regex(/^https:\/\/\S+$/).max(500).nullable(),
  primaryColor: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).nullable(),
  contactEmail: emailSchema.nullable(),
  contactPhone: optionalText,
  address: optionalText,
  timezone: required.max(60),
  defaultLocale: z.enum(["en", "ar"]),
  currency: z.string().trim().regex(/^[A-Z]{3}$/),
});

export const dealershipStatusSchema = z.object({
  status: z.enum(["active", "suspended"]),
  reason: z.string().trim().max(500).optional().nullable(),
});

export const domainSchema = z.object({
  domain: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/),
  isPrimary: z.boolean().optional(),
});

export const subscriptionActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("assign"),
    planId: z.uuid(),
    status: subscriptionStartStatus,
    billingCycle,
    periodEnd: futureDate.nullable(),
  }),
  z.object({ action: z.literal("renew"), subscriptionId: z.uuid(), periodEnd: futureDate }),
  z.object({
    action: z.literal("cancel"),
    subscriptionId: z.uuid(),
    reason: z.string().trim().max(500).optional().nullable(),
  }),
]);

const planFields = {
  name: required.max(80),
  description: optionalText,
  priceMonthly: money,
  priceYearly: money,
  currency: z.string().trim().regex(/^[A-Z]{3}$/),
  maxUsers: limit,
  maxBranches: limit,
  maxVehicles: limit,
  maxStorageMb: limit,
  maxCustomDomains: limit,
  graceDays: z.number().int().min(0).max(90),
  isActive: z.boolean(),
  sortOrder: z.number().int().min(0).max(10_000),
  features: z.record(z.string(), z.boolean()),
};

export const createPlanSchema = z.object({
  key: z.string().trim().regex(/^[a-z0-9]+(_[a-z0-9]+)*$/).max(40),
  ...planFields,
});
export const updatePlanSchema = z.object(planFields);

export const createInvoiceSchema = z.object({
  amount: money,
  currency: z.string().trim().regex(/^[A-Z]{3}$/),
  description: optionalText,
  subscriptionId: z.uuid().nullable(),
  status: z.enum(["draft", "issued"]),
  dueAt: futureDate.nullable(),
});

export const invoiceStatusSchema = z.object({ status: z.enum(["issued", "void"]) });

export const paymentSchema = z.object({
  amount: z.number().min(-1_000_000_000).max(1_000_000_000).refine((value) => value !== 0),
  method: z.enum(["manual", "bank_transfer", "cash", "card", "cheque", "other"]),
  reference: z.string().trim().max(120).optional().nullable(),
  notes: optionalText,
});

const staffRole = z.enum(["admin", "billing", "support", "owner"]);

export const inviteStaffSchema = z.object({
  email: emailSchema,
  firstName: required.max(80),
  lastName: required.max(80),
  role: staffRole,
});

export const updateStaffSchema = z.object({ role: staffRole });

const billingCurrency = z.enum(["AED", "INR"]);

export const refundSchema = z.object({
  transactionId: z.uuid(),
  amount: z.number().positive().max(1_000_000_000),
  reason: z.string().trim().max(500).optional().nullable(),
});

export const taxRateSchema = z.object({
  country: z.string().trim().regex(/^[A-Z]{2}$/),
  label: required.max(30),
  rate: z.number().min(0).max(100),
});

export const billingEntitySchema = z.object({
  currency: billingCurrency,
  legalName: required.max(200),
  taxId: z.string().trim().max(60).optional().nullable(),
  address: z.string().trim().max(500).optional().nullable(),
  email: z.email().max(200).optional().nullable().or(z.literal("")),
});

export const planPriceSchema = z.object({
  planId: z.uuid(),
  currency: billingCurrency,
  monthly: z.number().positive().max(1_000_000_000).nullable(),
  yearly: z.number().positive().max(1_000_000_000).nullable(),
});

export const demoRequestUpdateSchema = z.object({
  status: z.enum(demoRequestStatuses).optional(),
  staffNotes: z.string().max(4000).optional(),
  // null unlinks the dealership; leaving it out keeps it.
  dealershipId: z.uuid().nullable().optional(),
});
