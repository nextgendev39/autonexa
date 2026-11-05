/**
 * Minimal Database typing for Supabase clients.
 * Prefer regenerating with `npm run db:types` after local migrations.
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type GenericTable = {
  Row: Record<string, unknown>;
  Insert: Record<string, unknown>;
  Update: Record<string, unknown>;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          employee_code: string | null;
          first_name: string;
          last_name: string;
          display_name: string;
          phone: string | null;
          avatar_url: string | null;
          branch_id: string | null;
          status: "active" | "invited" | "suspended" | "disabled";
          deleted_at: string | null;
          deleted_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          first_name: string;
          last_name: string;
          display_name: string;
          employee_code?: string | null;
          phone?: string | null;
          avatar_url?: string | null;
          branch_id?: string | null;
          status?: "active" | "invited" | "suspended" | "disabled";
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Row"]>;
        Relationships: [];
      };
      user_roles: {
        Row: {
          id: string;
          user_id: string;
          role_id: string;
          branch_id: string | null;
          assigned_by: string | null;
          created_at: string;
        };
        Insert: {
          user_id: string;
          role_id: string;
          branch_id?: string | null;
          assigned_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["user_roles"]["Row"]>;
        Relationships: [];
      };
      roles: {
        Row: {
          id: string;
          key: string;
          name: string;
          description: string | null;
          is_system: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          key: string;
          name: string;
          description?: string | null;
          is_system?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["roles"]["Row"]>;
        Relationships: [];
      };
      branches: GenericTable;
      permissions: GenericTable;
      role_permissions: GenericTable;
      vehicles: GenericTable;
      vehicle_expenses: GenericTable;
      vehicle_status_history: GenericTable;
      vehicle_photos: GenericTable;
      vehicle_share_links: GenericTable;
      vehicle_pricing: GenericTable;
      vehicle_pricing_history: GenericTable;
      vehicle_makes: GenericTable;
      email_verification_otps: GenericTable;
      password_reset_otps: GenericTable;
      vehicle_models: GenericTable;
      vehicle_model_years: GenericTable;
      vehicle_variants: GenericTable;
      branch_locations: GenericTable;
      acquisitions: GenericTable;
      customers: GenericTable;
      acquisition_status_history: GenericTable;
      suppliers: GenericTable;
      reservations: GenericTable;
      sales: GenericTable;
      documents: GenericTable;
      notifications: GenericTable;
      push_subscriptions: GenericTable;
      system_settings: GenericTable;
      staff_documents: GenericTable;
      audit_logs: GenericTable;
    };
    Views: Record<string, never>;
    Functions: {
      cancel_unpaid_bookings: { Args: Record<PropertyKey, never>; Returns: number };
      notify_overdue_balances: { Args: Record<PropertyKey, never>; Returns: number };
      current_user_permissions: { Args: Record<PropertyKey, never>; Returns: string[] };
      current_user_roles: { Args: Record<PropertyKey, never>; Returns: string[] };
      activate_invited_profile: { Args: Record<PropertyKey, never>; Returns: undefined };
      assign_user_role: {
        Args: {
          target_user_id: string;
          role_key: string;
          target_branch_id?: string | null;
        };
        Returns: string;
      };
      revoke_user_role: { Args: { assignment_id: string }; Returns: undefined };
      has_permission: { Args: { permission_key: string }; Returns: boolean };
      read_vehicle_costs: {
        Args: { p_vehicle_id: string };
        Returns: {
          total_acquisition_cost: number;
          minimum_selling_price: number | null;
        }[];
      };
      read_vehicle_profit: {
        Args: { p_vehicle_id: string };
        Returns: {
          total_acquisition_cost: number;
          current_selling_price: number | null;
          minimum_selling_price: number | null;
          estimated_margin: number | null;
        }[];
      };
      update_vehicle_costs: {
        Args: {
          p_vehicle_id: string;
          p_total_acquisition_cost?: number | null;
          p_minimum_selling_price?: number | null;
        };
        Returns: undefined;
      };
      next_vehicle_stock_number: { Args: Record<PropertyKey, never>; Returns: string };
      change_vehicle_status: {
        Args: {
          p_vehicle_id: string;
          p_new_status: string;
          p_reason?: string | null;
        };
        Returns: Record<string, unknown>;
      };
      transfer_vehicle: {
        Args: {
          p_vehicle_id: string;
          p_branch_id: string;
          p_location_id?: string | null;
          p_reason?: string | null;
        };
        Returns: Record<string, unknown>;
      };
      archive_vehicle: {
        Args: {
          p_vehicle_id: string;
          p_reason?: string | null;
        };
        Returns: Record<string, unknown>;
      };
      set_vehicle_photo_primary: {
        Args: { p_photo_id: string };
        Returns: Record<string, unknown>;
      };
      get_vehicle_total_cost: {
        Args: { p_vehicle_id: string };
        Returns: {
          purchase_cost: number;
          acquisition_expenses: number;
          acquisition_total: number;
          workshop_cost: number;
          other_costs: number;
          total_vehicle_cost: number;
        }[];
      };
      get_vehicle_cost_breakdown: {
        Args: { p_vehicle_id: string };
        Returns: Record<string, unknown>;
      };
      get_vehicle_profitability: {
        Args: { p_vehicle_id: string; p_selling_price?: number | null };
        Returns: Record<string, unknown>;
      };
      upsert_vehicle_pricing: {
        Args: {
          p_vehicle_id: string;
          p_minimum_selling_price?: number | null;
          p_target_selling_price?: number | null;
          p_advertised_price?: number | null;
          p_current_selling_price?: number | null;
          p_maximum_discount_amount?: number | null;
          p_maximum_discount_percent?: number | null;
          p_pricing_notes?: string | null;
          p_change_reason?: string;
          p_change_notes?: string | null;
          p_override_minimum?: boolean;
          p_override_reason?: string | null;
          p_submit_for_approval?: boolean;
        };
        Returns: Record<string, unknown>;
      };
      approve_vehicle_pricing: {
        Args: {
          p_vehicle_id: string;
          p_note?: string | null;
          p_approve?: boolean;
        };
        Returns: Record<string, unknown>;
      };
      evaluate_vehicle_ready_for_sale: {
        Args: { p_vehicle_id: string };
        Returns: Record<string, unknown>;
      };
      mark_vehicle_ready_for_sale: {
        Args: {
          p_vehicle_id: string;
          p_reason?: string | null;
          p_override?: boolean;
          p_override_reason?: string | null;
        };
        Returns: Record<string, unknown>;
      };
      next_acquisition_number: { Args: Record<PropertyKey, never>; Returns: string };
      read_acquisition_costs: {
        Args: { p_acquisition_id: string };
        Returns: {
          asking_price: number | null;
          purchase_price: number;
          expense_total: number;
          total_acquisition_cost: number;
        }[];
      };
      read_acquisitions_costs: {
        Args: { p_ids: string[] };
        Returns: {
          acquisition_id: string;
          asking_price: number | null;
          purchase_price: number;
          expense_total: number;
          total_acquisition_cost: number;
        }[];
      };
      change_acquisition_status: {
        Args: {
          p_acquisition_id: string;
          p_new_status: string;
          p_reason?: string | null;
        };
        Returns: Record<string, unknown>;
      };
      approve_acquisition: {
        Args: { p_acquisition_id: string; p_note?: string | null };
        Returns: Record<string, unknown>;
      };
      reject_acquisition: {
        Args: { p_acquisition_id: string; p_reason: string };
        Returns: Record<string, unknown>;
      };
      cancel_acquisition: {
        Args: { p_acquisition_id: string; p_reason: string };
        Returns: Record<string, unknown>;
      };
      confirm_acquisition_purchase: {
        Args: { p_acquisition_id: string; p_reason?: string | null };
        Returns: Record<string, unknown>;
      };
      receive_acquisition: {
        Args: { p_acquisition_id: string; p_reason?: string | null };
        Returns: Record<string, unknown>;
      };
      next_workshop_order_number: { Args: Record<PropertyKey, never>; Returns: string };
      next_workshop_job_number: { Args: Record<PropertyKey, never>; Returns: string };
      read_workshop_costs: {
        Args: { p_order_id: string };
        Returns: {
          parts_total: number;
          labour_total: number;
          expenses_total: number;
          actual_total: number;
          estimated_total: number;
          variance: number;
        }[];
      };
      recalculate_workshop_order_costs: {
        Args: { p_order_id: string };
        Returns: undefined;
      };
      workshop_cost_approval_threshold: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
      submit_workshop_for_approval: {
        Args: { p_order_id: string };
        Returns: Record<string, unknown>;
      };
      approve_workshop_order: {
        Args: { p_order_id: string; p_note?: string | null };
        Returns: Record<string, unknown>;
      };
      reject_workshop_order: {
        Args: { p_order_id: string; p_reason: string };
        Returns: Record<string, unknown>;
      };
      return_workshop_for_changes: {
        Args: { p_order_id: string; p_reason: string };
        Returns: Record<string, unknown>;
      };
      schedule_workshop_order: {
        Args: {
          p_order_id: string;
          p_start?: string | null;
          p_end?: string | null;
        };
        Returns: Record<string, unknown>;
      };
      start_workshop_order: {
        Args: { p_order_id: string };
        Returns: Record<string, unknown>;
      };
      hold_workshop_order: {
        Args: {
          p_order_id: string;
          p_reason: string;
          p_notes?: string | null;
        };
        Returns: Record<string, unknown>;
      };
      cancel_workshop_order: {
        Args: { p_order_id: string; p_reason: string };
        Returns: Record<string, unknown>;
      };
      submit_workshop_quality_check: {
        Args: { p_order_id: string };
        Returns: Record<string, unknown>;
      };
      perform_workshop_quality_check: {
        Args: {
          p_order_id: string;
          p_result: string;
          p_notes?: string | null;
          p_checklist?: Json;
        };
        Returns: Record<string, unknown>;
      };
      assign_workshop_job: {
        Args: {
          p_job_id: string;
          p_assigned_to?: string | null;
          p_vendor_id?: string | null;
        };
        Returns: Record<string, unknown>;
      };
      start_workshop_job: {
        Args: { p_job_id: string };
        Returns: Record<string, unknown>;
      };
      complete_workshop_job: {
        Args: { p_job_id: string };
        Returns: Record<string, unknown>;
      };
      set_workshop_job_waiting_parts: {
        Args: { p_job_id: string };
        Returns: Record<string, unknown>;
      };
      set_workshop_job_waiting_vendor: {
        Args: { p_job_id: string };
        Returns: Record<string, unknown>;
      };
      resume_workshop_job: {
        Args: { p_job_id: string };
        Returns: Record<string, unknown>;
      };
      cancel_workshop_job: {
        Args: { p_job_id: string; p_reason?: string | null };
        Returns: Record<string, unknown>;
      };
      bump_workshop_estimate: {
        Args: {
          p_order_id: string;
          p_new_estimate: number;
          p_override?: boolean;
        };
        Returns: Record<string, unknown>;
      };
      create_workshop_from_inspection: {
        Args: {
          p_inspection_id: string;
          p_finding_ids: string[];
          p_branch_id?: string | null;
          p_priority?: string;
          p_workshop_type?: string;
          p_description?: string | null;
          p_allow_duplicates?: boolean;
        };
        Returns: Record<string, unknown>;
      };
      issue_email_verification_otp: {
        Args: {
          p_user_id: string;
          p_email: string;
          p_otp_hash: string;
          p_cooldown_seconds?: number;
          p_ttl_seconds?: number;
        };
        Returns: {
          otp_id: string;
          last_sent_at: string;
          expires_at: string;
          send_count: number;
          issued: boolean;
        }[];
      };
      record_email_verification_attempt: {
        Args: { p_otp_id: string; p_compared_hash: string; p_matches: boolean };
        Returns: { outcome: string; user_id: string | null; attempts_remaining: number }[];
      };
      reopen_email_verification_otp: {
        Args: { p_otp_id: string };
        Returns: undefined;
      };
      auth_user_for_email: {
        Args: { p_email: string };
        Returns: { user_id: string; email: string; email_confirmed_at: string | null }[];
      };
      cleanup_email_verification_otps: {
        Args: Record<string, never>;
        Returns: number;
      };
      issue_password_reset_otp: {
        Args: {
          p_user_id: string;
          p_email: string;
          p_otp_hash: string;
          p_cooldown_seconds?: number;
          p_ttl_seconds?: number;
        };
        Returns: {
          otp_id: string;
          last_sent_at: string;
          expires_at: string;
          send_count: number;
          issued: boolean;
        }[];
      };
      record_password_reset_attempt: {
        Args: {
          p_otp_id: string;
          p_compared_hash: string;
          p_matches: boolean;
          p_grant_hash: string;
          p_grant_ttl_seconds?: number;
        };
        Returns: { outcome: string; user_id: string | null; attempts_remaining: number }[];
      };
      consume_password_reset_grant: {
        Args: { p_grant_hash: string };
        Returns: { otp_id: string; user_id: string; email: string }[];
      };
      release_password_reset_grant: {
        Args: { p_otp_id: string };
        Returns: undefined;
      };
      cleanup_password_reset_otps: {
        Args: Record<string, never>;
        Returns: number;
      };
      write_audit_log: {
        Args: {
          p_action: string;
          p_entity_type: string;
          p_entity_id: string;
          p_old_values?: Json | null;
          p_new_values?: Json | null;
          p_metadata?: Json | null;
        };
        Returns: string;
      };
    };
    Enums: {
      user_status: "active" | "invited" | "suspended" | "disabled";
      vehicle_status:
        | "acquired"
        | "under_inspection"
        | "inspection_failed"
        | "under_repair"
        | "ready_for_sale"
        | "reserved"
        | "sold"
        | "delivered"
        | "returned"
        | "archived";
      acquisition_status:
        | "draft"
        | "sourcing"
        | "negotiating"
        | "pending_approval"
        | "approved"
        | "purchased"
        | "documents_pending"
        | "received"
        | "cancelled"
        | "rejected";
      acquisition_source_type:
        | "individual_owner"
        | "dealer"
        | "auction"
        | "trade_in"
        | "fleet"
        | "importer"
        | "company"
        | "broker"
        | "other";
      inspection_status:
        | "draft"
        | "assigned"
        | "in_progress"
        | "submitted"
        | "under_review"
        | "approved"
        | "rejected"
        | "cancelled";
      inspection_type:
        | "full_inspection"
        | "basic_inspection"
        | "pre_purchase_inspection"
        | "return_inspection"
        | "re_inspection";
      inspection_result:
        | "pass"
        | "pass_with_advisories"
        | "repair_required"
        | "fail";
    };
    CompositeTypes: Record<string, never>;
  };
};
