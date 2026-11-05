import { authUsers } from "drizzle-orm/supabase";
import { relations } from "drizzle-orm/relations";
import {
  profiles,
  branches,
  acquisitions,
  vehicleExpenses,
  documents,
  vehicles,
  vehicleStatusHistory,
  vehiclePhotos,
  emailVerificationOtps,
  passwordResetOtps,
  customers,
  sales,
  userRoles,
  roles,
  reservations,
  notifications,
  pushSubscriptions,
  auditLogs,
  documentTypes,
  acquisitionStatusHistory,
  branchLocations,
  vehicleMakes,
  vehicleModels,
  vehicleModelYears,
  vehicleVariants,
  suppliers,
  systemSettings,
  vehiclePricing,
  vehiclePricingHistory,
  permissions,
  rolePermissions,
} from "./schema";

export const branchesRelations = relations(branches, ({ one, many }) => ({
  profile: one(profiles, {
    fields: [branches.managerUserId],
    references: [profiles.id],
    relationName: "branches_managerUserId_profiles_id",
  }),
  profiles: many(profiles, {
    relationName: "profiles_branchId_branches_id",
  }),
  customers: many(customers),
  userRoles: many(userRoles),
  reservations: many(reservations),
  sales: many(sales),
  documents: many(documents),
  vehicles: many(vehicles),
  branchLocations: many(branchLocations),
  acquisitions: many(acquisitions),
}));

export const profilesRelations = relations(profiles, ({ one, many }) => ({
  branches: many(branches, {
    relationName: "branches_managerUserId_profiles_id",
  }),
  branch: one(branches, {
    fields: [profiles.branchId],
    references: [branches.id],
    relationName: "profiles_branchId_branches_id",
  }),
  profile: one(profiles, {
    fields: [profiles.deletedBy],
    references: [profiles.id],
    relationName: "profiles_deletedBy_profiles_id",
  }),
  profiles: many(profiles, {
    relationName: "profiles_deletedBy_profiles_id",
  }),
  authUsers: one(authUsers, {
    fields: [profiles.id],
    references: [authUsers.id],
  }),
  vehicleExpenses: many(vehicleExpenses),
  vehicleStatusHistories: many(vehicleStatusHistory),
  vehiclePhotos: many(vehiclePhotos),
  customers_createdBy: many(customers, {
    relationName: "customers_createdBy_profiles_id",
  }),
  customers_deletedBy: many(customers, {
    relationName: "customers_deletedBy_profiles_id",
  }),
  userRoles_assignedBy: many(userRoles, {
    relationName: "userRoles_assignedBy_profiles_id",
  }),
  userRoles_userId: many(userRoles, {
    relationName: "userRoles_userId_profiles_id",
  }),
  reservations_createdBy: many(reservations, {
    relationName: "reservations_createdBy_profiles_id",
  }),
  reservations_salespersonId: many(reservations, {
    relationName: "reservations_salespersonId_profiles_id",
  }),
  sales_createdBy: many(sales, {
    relationName: "sales_createdBy_profiles_id",
  }),
  sales_salespersonId: many(sales, {
    relationName: "sales_salespersonId_profiles_id",
  }),
  sales_updatedBy: many(sales, {
    relationName: "sales_updatedBy_profiles_id",
  }),
  notifications: many(notifications),
  pushSubscriptions: many(pushSubscriptions),
  auditLogs: many(auditLogs),
  documents_deletedBy: many(documents, {
    relationName: "documents_deletedBy_profiles_id",
  }),
  documents_uploadedBy: many(documents, {
    relationName: "documents_uploadedBy_profiles_id",
  }),
  acquisitionStatusHistories: many(acquisitionStatusHistory),
  vehicles_createdBy: many(vehicles, {
    relationName: "vehicles_createdBy_profiles_id",
  }),
  vehicles_deletedBy: many(vehicles, {
    relationName: "vehicles_deletedBy_profiles_id",
  }),
  vehicles_updatedBy: many(vehicles, {
    relationName: "vehicles_updatedBy_profiles_id",
  }),
  acquisitions_approvedBy: many(acquisitions, {
    relationName: "acquisitions_approvedBy_profiles_id",
  }),
  acquisitions_createdBy: many(acquisitions, {
    relationName: "acquisitions_createdBy_profiles_id",
  }),
  acquisitions_rejectedBy: many(acquisitions, {
    relationName: "acquisitions_rejectedBy_profiles_id",
  }),
  acquisitions_updatedBy: many(acquisitions, {
    relationName: "acquisitions_updatedBy_profiles_id",
  }),
  systemSettings: many(systemSettings),
  vehiclePricings_approvedBy: many(vehiclePricing, {
    relationName: "vehiclePricing_approvedBy_profiles_id",
  }),
  vehiclePricings_createdBy: many(vehiclePricing, {
    relationName: "vehiclePricing_createdBy_profiles_id",
  }),
  vehiclePricings_updatedBy: many(vehiclePricing, {
    relationName: "vehiclePricing_updatedBy_profiles_id",
  }),
  vehiclePricingHistories: many(vehiclePricingHistory),
}));

export const authUsersRelations = relations(authUsers, ({ many }) => ({
  profiles: many(profiles),
  emailVerificationOtps: many(emailVerificationOtps),
  passwordResetOtps: many(passwordResetOtps),
}));

export const vehicleExpensesRelations = relations(vehicleExpenses, ({ one }) => ({
  acquisition: one(acquisitions, {
    fields: [vehicleExpenses.acquisitionId],
    references: [acquisitions.id],
  }),
  profile: one(profiles, {
    fields: [vehicleExpenses.createdBy],
    references: [profiles.id],
  }),
  document: one(documents, {
    fields: [vehicleExpenses.documentId],
    references: [documents.id],
  }),
  vehicle: one(vehicles, {
    fields: [vehicleExpenses.vehicleId],
    references: [vehicles.id],
  }),
}));

export const acquisitionsRelations = relations(acquisitions, ({ one, many }) => ({
  vehicleExpenses: many(vehicleExpenses),
  acquisitionStatusHistories: many(acquisitionStatusHistory),
  profile_approvedBy: one(profiles, {
    fields: [acquisitions.approvedBy],
    references: [profiles.id],
    relationName: "acquisitions_approvedBy_profiles_id",
  }),
  branch: one(branches, {
    fields: [acquisitions.branchId],
    references: [branches.id],
  }),
  profile_createdBy: one(profiles, {
    fields: [acquisitions.createdBy],
    references: [profiles.id],
    relationName: "acquisitions_createdBy_profiles_id",
  }),
  customer: one(customers, {
    fields: [acquisitions.customerId],
    references: [customers.id],
  }),
  profile_rejectedBy: one(profiles, {
    fields: [acquisitions.rejectedBy],
    references: [profiles.id],
    relationName: "acquisitions_rejectedBy_profiles_id",
  }),
  supplier: one(suppliers, {
    fields: [acquisitions.supplierId],
    references: [suppliers.id],
  }),
  profile_updatedBy: one(profiles, {
    fields: [acquisitions.updatedBy],
    references: [profiles.id],
    relationName: "acquisitions_updatedBy_profiles_id",
  }),
  vehicle: one(vehicles, {
    fields: [acquisitions.vehicleId],
    references: [vehicles.id],
  }),
}));

export const documentsRelations = relations(documents, ({ one, many }) => ({
  vehicleExpenses: many(vehicleExpenses),
  branch: one(branches, {
    fields: [documents.branchId],
    references: [branches.id],
  }),
  profile_deletedBy: one(profiles, {
    fields: [documents.deletedBy],
    references: [profiles.id],
    relationName: "documents_deletedBy_profiles_id",
  }),
  documentType: one(documentTypes, {
    fields: [documents.documentTypeId],
    references: [documentTypes.id],
  }),
  profile_uploadedBy: one(profiles, {
    fields: [documents.uploadedBy],
    references: [profiles.id],
    relationName: "documents_uploadedBy_profiles_id",
  }),
}));

export const vehiclesRelations = relations(vehicles, ({ one, many }) => ({
  vehicleExpenses: many(vehicleExpenses),
  vehicleStatusHistories: many(vehicleStatusHistory),
  vehiclePhotos: many(vehiclePhotos),
  reservations: many(reservations),
  sales: many(sales),
  branch: one(branches, {
    fields: [vehicles.branchId],
    references: [branches.id],
  }),
  profile_createdBy: one(profiles, {
    fields: [vehicles.createdBy],
    references: [profiles.id],
    relationName: "vehicles_createdBy_profiles_id",
  }),
  profile_deletedBy: one(profiles, {
    fields: [vehicles.deletedBy],
    references: [profiles.id],
    relationName: "vehicles_deletedBy_profiles_id",
  }),
  branchLocation: one(branchLocations, {
    fields: [vehicles.locationId],
    references: [branchLocations.id],
  }),
  vehicleMake: one(vehicleMakes, {
    fields: [vehicles.makeId],
    references: [vehicleMakes.id],
  }),
  vehicleModel: one(vehicleModels, {
    fields: [vehicles.modelId],
    references: [vehicleModels.id],
  }),
  vehicleModelYear: one(vehicleModelYears, {
    fields: [vehicles.modelYearId],
    references: [vehicleModelYears.id],
  }),
  profile_updatedBy: one(profiles, {
    fields: [vehicles.updatedBy],
    references: [profiles.id],
    relationName: "vehicles_updatedBy_profiles_id",
  }),
  vehicleVariant: one(vehicleVariants, {
    fields: [vehicles.variantId],
    references: [vehicleVariants.id],
  }),
  acquisitions: many(acquisitions),
  vehiclePricings: many(vehiclePricing),
  vehiclePricingHistories: many(vehiclePricingHistory),
}));

export const vehicleStatusHistoryRelations = relations(vehicleStatusHistory, ({ one }) => ({
  profile: one(profiles, {
    fields: [vehicleStatusHistory.changedBy],
    references: [profiles.id],
  }),
  vehicle: one(vehicles, {
    fields: [vehicleStatusHistory.vehicleId],
    references: [vehicles.id],
  }),
}));

export const vehiclePhotosRelations = relations(vehiclePhotos, ({ one }) => ({
  profile: one(profiles, {
    fields: [vehiclePhotos.uploadedBy],
    references: [profiles.id],
  }),
  vehicle: one(vehicles, {
    fields: [vehiclePhotos.vehicleId],
    references: [vehicles.id],
  }),
}));

export const emailVerificationOtpsRelations = relations(emailVerificationOtps, ({ one }) => ({
  authUsers: one(authUsers, {
    fields: [emailVerificationOtps.userId],
    references: [authUsers.id],
  }),
}));

export const passwordResetOtpsRelations = relations(passwordResetOtps, ({ one }) => ({
  authUsers: one(authUsers, {
    fields: [passwordResetOtps.userId],
    references: [authUsers.id],
  }),
}));

export const customersRelations = relations(customers, ({ one, many }) => ({
  branch: one(branches, {
    fields: [customers.branchId],
    references: [branches.id],
  }),
  profile_createdBy: one(profiles, {
    fields: [customers.createdBy],
    references: [profiles.id],
    relationName: "customers_createdBy_profiles_id",
  }),
  profile_deletedBy: one(profiles, {
    fields: [customers.deletedBy],
    references: [profiles.id],
    relationName: "customers_deletedBy_profiles_id",
  }),
  reservations: many(reservations),
  sales: many(sales),
  acquisitions: many(acquisitions),
}));

export const salesRelations = relations(sales, ({ one }) => ({
  branch: one(branches, {
    fields: [sales.branchId],
    references: [branches.id],
  }),
  profile_createdBy: one(profiles, {
    fields: [sales.createdBy],
    references: [profiles.id],
    relationName: "sales_createdBy_profiles_id",
  }),
  customer: one(customers, {
    fields: [sales.customerId],
    references: [customers.id],
  }),
  reservation: one(reservations, {
    fields: [sales.reservationId],
    references: [reservations.id],
  }),
  profile_salespersonId: one(profiles, {
    fields: [sales.salespersonId],
    references: [profiles.id],
    relationName: "sales_salespersonId_profiles_id",
  }),
  profile_updatedBy: one(profiles, {
    fields: [sales.updatedBy],
    references: [profiles.id],
    relationName: "sales_updatedBy_profiles_id",
  }),
  vehicle: one(vehicles, {
    fields: [sales.vehicleId],
    references: [vehicles.id],
  }),
}));

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  profile_assignedBy: one(profiles, {
    fields: [userRoles.assignedBy],
    references: [profiles.id],
    relationName: "userRoles_assignedBy_profiles_id",
  }),
  branch: one(branches, {
    fields: [userRoles.branchId],
    references: [branches.id],
  }),
  role: one(roles, {
    fields: [userRoles.roleId],
    references: [roles.id],
  }),
  profile_userId: one(profiles, {
    fields: [userRoles.userId],
    references: [profiles.id],
    relationName: "userRoles_userId_profiles_id",
  }),
}));

export const rolesRelations = relations(roles, ({ many }) => ({
  userRoles: many(userRoles),
  rolePermissions: many(rolePermissions),
}));

export const reservationsRelations = relations(reservations, ({ one, many }) => ({
  branch: one(branches, {
    fields: [reservations.branchId],
    references: [branches.id],
  }),
  profile_createdBy: one(profiles, {
    fields: [reservations.createdBy],
    references: [profiles.id],
    relationName: "reservations_createdBy_profiles_id",
  }),
  customer: one(customers, {
    fields: [reservations.customerId],
    references: [customers.id],
  }),
  profile_salespersonId: one(profiles, {
    fields: [reservations.salespersonId],
    references: [profiles.id],
    relationName: "reservations_salespersonId_profiles_id",
  }),
  vehicle: one(vehicles, {
    fields: [reservations.vehicleId],
    references: [vehicles.id],
  }),
  sales: many(sales),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  profile: one(profiles, {
    fields: [notifications.userId],
    references: [profiles.id],
  }),
}));

export const pushSubscriptionsRelations = relations(pushSubscriptions, ({ one }) => ({
  profile: one(profiles, {
    fields: [pushSubscriptions.userId],
    references: [profiles.id],
  }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  profile: one(profiles, {
    fields: [auditLogs.userId],
    references: [profiles.id],
  }),
}));

export const documentTypesRelations = relations(documentTypes, ({ many }) => ({
  documents: many(documents),
}));

export const acquisitionStatusHistoryRelations = relations(acquisitionStatusHistory, ({ one }) => ({
  acquisition: one(acquisitions, {
    fields: [acquisitionStatusHistory.acquisitionId],
    references: [acquisitions.id],
  }),
  profile: one(profiles, {
    fields: [acquisitionStatusHistory.changedBy],
    references: [profiles.id],
  }),
}));

export const branchLocationsRelations = relations(branchLocations, ({ one, many }) => ({
  vehicles: many(vehicles),
  branch: one(branches, {
    fields: [branchLocations.branchId],
    references: [branches.id],
  }),
}));

export const vehicleMakesRelations = relations(vehicleMakes, ({ many }) => ({
  vehicles: many(vehicles),
  vehicleModels: many(vehicleModels),
}));

export const vehicleModelsRelations = relations(vehicleModels, ({ one, many }) => ({
  vehicles: many(vehicles),
  vehicleMake: one(vehicleMakes, {
    fields: [vehicleModels.makeId],
    references: [vehicleMakes.id],
  }),
  vehicleModelYears: many(vehicleModelYears),
}));

export const vehicleModelYearsRelations = relations(vehicleModelYears, ({ one, many }) => ({
  vehicles: many(vehicles),
  vehicleModel: one(vehicleModels, {
    fields: [vehicleModelYears.modelId],
    references: [vehicleModels.id],
  }),
  vehicleVariants: many(vehicleVariants),
}));

export const vehicleVariantsRelations = relations(vehicleVariants, ({ one, many }) => ({
  vehicles: many(vehicles),
  vehicleModelYear: one(vehicleModelYears, {
    fields: [vehicleVariants.modelYearId],
    references: [vehicleModelYears.id],
  }),
}));

export const suppliersRelations = relations(suppliers, ({ many }) => ({
  acquisitions: many(acquisitions),
}));

export const systemSettingsRelations = relations(systemSettings, ({ one }) => ({
  profile: one(profiles, {
    fields: [systemSettings.updatedBy],
    references: [profiles.id],
  }),
}));

export const vehiclePricingRelations = relations(vehiclePricing, ({ one, many }) => ({
  profile_approvedBy: one(profiles, {
    fields: [vehiclePricing.approvedBy],
    references: [profiles.id],
    relationName: "vehiclePricing_approvedBy_profiles_id",
  }),
  profile_createdBy: one(profiles, {
    fields: [vehiclePricing.createdBy],
    references: [profiles.id],
    relationName: "vehiclePricing_createdBy_profiles_id",
  }),
  profile_updatedBy: one(profiles, {
    fields: [vehiclePricing.updatedBy],
    references: [profiles.id],
    relationName: "vehiclePricing_updatedBy_profiles_id",
  }),
  vehicle: one(vehicles, {
    fields: [vehiclePricing.vehicleId],
    references: [vehicles.id],
  }),
  vehiclePricingHistories: many(vehiclePricingHistory),
}));

export const vehiclePricingHistoryRelations = relations(vehiclePricingHistory, ({ one }) => ({
  profile: one(profiles, {
    fields: [vehiclePricingHistory.changedBy],
    references: [profiles.id],
  }),
  vehiclePricing: one(vehiclePricing, {
    fields: [vehiclePricingHistory.pricingId],
    references: [vehiclePricing.id],
  }),
  vehicle: one(vehicles, {
    fields: [vehiclePricingHistory.vehicleId],
    references: [vehicles.id],
  }),
}));

export const permissionsRelations = relations(permissions, ({ many }) => ({
  rolePermissions: many(rolePermissions),
}));
