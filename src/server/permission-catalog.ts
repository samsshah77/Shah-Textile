import type { PermissionAction } from "@prisma/client";

export type CatalogResource = {
  key: string;
  label: string;
  description?: string;
  sensitive?: boolean;
};

export type CatalogModule = {
  key: string;
  label: string;
  description: string;
  sortOrder: number;
  resources: CatalogResource[];
};

export const PERMISSION_ACTIONS: PermissionAction[] = [
  "VIEW",
  "CREATE",
  "UPDATE",
  "DELETE",
  "APPROVE",
  "POST",
  "EXPORT",
  "ASSIGN",
  "MANAGE",
];

export const PERMISSION_CATALOG: CatalogModule[] = [
  {
    key: "admin",
    label: "Administration",
    description: "Users, roles, approvals, and system controls",
    sortOrder: 10,
    resources: [
      { key: "users", label: "Users" },
      { key: "roles", label: "Roles" },
      { key: "permissions", label: "Permissions" },
      { key: "approval_requests", label: "Approval requests" },
      { key: "audit_logs", label: "Audit logs", sensitive: true },
      { key: "system_settings", label: "System settings", sensitive: true },
    ],
  },
  {
    key: "floor",
    label: "Floor & production",
    description: "Looms, shifts, production, downtime, and material issues",
    sortOrder: 20,
    resources: [
      { key: "looms", label: "Looms" },
      { key: "shifts", label: "Shifts" },
      { key: "production_entries", label: "Production entries" },
      { key: "downtime_records", label: "Downtime records" },
      { key: "material_issues", label: "Material issues" },
      { key: "production_reports", label: "Production reports" },
    ],
  },
  {
    key: "quality",
    label: "Quality control",
    description: "Inspections, defects, non-conformance, and corrective actions",
    sortOrder: 30,
    resources: [
      { key: "quality_inspections", label: "Quality inspections" },
      { key: "defects", label: "Defects" },
      { key: "non_conformance", label: "Non-conformance" },
      { key: "corrective_actions", label: "Corrective actions" },
      { key: "quality_reports", label: "Quality reports" },
    ],
  },
  {
    key: "accounts",
    label: "Accounts",
    description: "Chart of accounts, journals, invoices, payments, and reports",
    sortOrder: 40,
    resources: [
      { key: "chart_of_accounts", label: "Chart of accounts" },
      { key: "journal_entries", label: "Journal entries" },
      { key: "invoices", label: "Invoices" },
      { key: "payments", label: "Payments", sensitive: true },
      { key: "expenses", label: "Expenses" },
      { key: "financial_reports", label: "Financial reports", sensitive: true },
      { key: "bank_reconciliation", label: "Bank reconciliation", sensitive: true },
    ],
  },
  {
    key: "payroll",
    label: "Payroll",
    description: "Employees, attendance, salary data, and payroll runs",
    sortOrder: 50,
    resources: [
      { key: "employees", label: "Employees" },
      { key: "attendance", label: "Attendance" },
      { key: "salary_components", label: "Salary components", sensitive: true },
      { key: "payroll_runs", label: "Payroll runs", sensitive: true },
      { key: "payslips", label: "Payslips", sensitive: true },
    ],
  },
];

export const ROLE_MODULE_ACTIONS: Record<string, Partial<Record<string, PermissionAction[]>>> = {
  admin: Object.fromEntries(PERMISSION_CATALOG.map((module) => [module.key, PERMISSION_ACTIONS])),
  accountant: {
    floor: ["VIEW", "EXPORT"],
    quality: ["VIEW", "EXPORT"],
    accounts: ["VIEW", "CREATE", "UPDATE", "EXPORT"],
    payroll: ["VIEW", "CREATE", "UPDATE", "EXPORT"],
  },
  quality_controller: {
    floor: ["VIEW", "CREATE", "UPDATE", "EXPORT"],
    quality: ["VIEW", "CREATE", "UPDATE", "APPROVE", "EXPORT"],
  },
  fault: {
    floor: ["VIEW", "CREATE"],
    quality: ["VIEW", "CREATE"],
  },
};

export const ROLE_RESOURCE_DENIES: Array<{
  roleKey: string;
  moduleKey: string;
  resourceKey: string;
  actions: PermissionAction[];
}> = [
  {
    roleKey: "accountant",
    moduleKey: "payroll",
    resourceKey: "payroll_runs",
    actions: ["APPROVE", "POST"],
  },
];

export function findCatalogModule(moduleKey: string) {
  return PERMISSION_CATALOG.find((module) => module.key === moduleKey);
}
