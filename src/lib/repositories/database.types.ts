type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type TableRelationship = {
  foreignKeyName: string;
  columns: string[];
  isOneToOne?: boolean;
  referencedRelation: string;
  referencedColumns: string[];
};

export interface Database {
  public: {
    Tables: {
      salon_settings: {
        Row: {
          id: string;
          name: string;
          tagline: string;
          description: string;
          logo_url: string | null;
          cover_image_url: string | null;
          address: string;
          maps_url: string;
          instagram_handle: string;
          sister_studio_handle?: string | null;
          whatsapp_number: string;
          contact_email: string;
          timezone: string;
          brand_accent_light: string;
          brand_accent_dark: string;
          default_public_mode: 'light' | 'dark' | 'system';
          default_admin_mode: 'light' | 'dark' | 'system';
          corner_style: 'sharp' | 'soft' | 'rounded' | 'pill';
          public_palette?: 'laikona' | 'monochrome';
          default_booking_layout: 'month' | 'week' | 'column';
          enabled_booking_layouts: string[];
          lock_timezone: boolean;
          slot_interval_minutes: number;
          enable_slot_hold: boolean;
          slot_hold_minutes: number;
          min_booking_notice_minutes: number;
          max_booking_days_ahead: number;
          min_cancel_hours: number;
          min_reschedule_hours: number;
          cancellation_policy_text: string;
          booking_instructions_text: string;
          payment_mode: 'none' | 'manual_transfer' | 'stripe' | 'mercadopago';
          deposit_bank_name: string | null;
          deposit_account_holder: string | null;
          deposit_beneficiary?: string | null;
          deposit_clabe: string | null;
          deposit_amount_cents?: number;
          deposit_instructions: string | null;
          currency: string;
          service_mode?: 'studio' | 'home' | 'online';
          business_type?: string | null;
          team_size_tier?: string | null;
          onboarding_completed?: boolean;
          sound_alerts_enabled?: boolean;
          lock_past_bookings?: boolean;
          max_active_bookings_per_client?: number;
          privacy_policy_version?: string;
          optimize_continuous_slots?: boolean;
          landing_content: Json;
          whatsapp_booking_enabled: boolean;
          sms_reminders_enabled: boolean;
          retention_notice_email?: string | null;
          whatsapp_monthly_quota?: number;
          meta_pixel_id: string | null;
          ga4_measurement_id: string | null;
          google_review_url: string | null;
          default_commission_percent: number;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['salon_settings']['Row']>;
        Update: Partial<Database['public']['Tables']['salon_settings']['Row']>;
        Relationships: TableRelationship[];
      };
      staff_members: {
        Row: {
          id: string;
          name: string;
          role_title: string;
          bio: string;
          avatar_url: string | null;
          booking_slug: string;
          commission_percent: number;
          is_active: boolean;
          display_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database['public']['Tables']['staff_members']['Row'],
          'id' | 'role_title' | 'bio' | 'commission_percent' | 'is_active' | 'display_order' | 'created_at' | 'updated_at'
        > &
          Partial<Database['public']['Tables']['staff_members']['Row']>;
        Update: Partial<Database['public']['Tables']['staff_members']['Row']>;
        Relationships: TableRelationship[];
      };
      admin_users: {
        Row: {
          id: string;
          auth_user_id: string | null;
          email: string;
          full_name: string;
          role: 'owner' | 'admin' | 'specialist';
          staff_member_id: string | null;
          is_active: boolean;
          invited_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Pick<
          Database['public']['Tables']['admin_users']['Row'],
          'email' | 'full_name' | 'role'
        > &
          Partial<Database['public']['Tables']['admin_users']['Row']>;
        Update: Partial<Database['public']['Tables']['admin_users']['Row']>;
        Relationships: TableRelationship[];
      };
      service_categories: {
        Row: {
          id: string;
          name: string;
          slug: string;
          display_order: number;
        };
        Insert: Pick<
          Database['public']['Tables']['service_categories']['Row'],
          'name' | 'slug'
        > &
          Partial<Database['public']['Tables']['service_categories']['Row']>;
        Update: Partial<Database['public']['Tables']['service_categories']['Row']>;
        Relationships: TableRelationship[];
      };
      services: {
        Row: {
          id: string;
          category_id: string | null;
          name: string;
          slug: string;
          description: string;
          duration_minutes: number;
          price_cents: number;
          is_starting_price?: boolean;
          buffer_before_minutes: number;
          buffer_after_minutes: number;
          requires_confirmation: boolean;
          deposit_required: boolean;
          deposit_amount_cents: number;
          allow_inspo_photo: boolean;
          is_active: boolean;
          is_featured: boolean;
          is_private?: boolean;
          display_order: number;
          image_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Pick<
          Database['public']['Tables']['services']['Row'],
          'name' | 'slug' | 'duration_minutes' | 'price_cents'
        > &
          Partial<Database['public']['Tables']['services']['Row']>;
        Update: Partial<Database['public']['Tables']['services']['Row']>;
        Relationships: TableRelationship[];
      };
      service_addons: {
        Row: {
          id: string;
          name: string;
          description: string;
          extra_minutes: number;
          extra_price_cents: number;
          applies_to_all: boolean;
          service_ids: string[];
          is_active: boolean;
          display_order: number;
        };
        Insert: Pick<Database['public']['Tables']['service_addons']['Row'], 'name'> &
          Partial<Database['public']['Tables']['service_addons']['Row']>;
        Update: Partial<Database['public']['Tables']['service_addons']['Row']>;
        Relationships: TableRelationship[];
      };
      staff_services: {
        Row: {
          staff_id: string;
          service_id: string;
          custom_duration_minutes: number | null;
        };
        Insert: Pick<
          Database['public']['Tables']['staff_services']['Row'],
          'staff_id' | 'service_id'
        > &
          Partial<Database['public']['Tables']['staff_services']['Row']>;
        Update: Partial<Database['public']['Tables']['staff_services']['Row']>;
        Relationships: TableRelationship[];
      };
      availability_schedules: {
        Row: {
          id: string;
          staff_id: string;
          name: string;
          timezone: string;
          is_default: boolean;
          created_at: string;
        };
        Insert: Pick<
          Database['public']['Tables']['availability_schedules']['Row'],
          'staff_id'
        > &
          Partial<Database['public']['Tables']['availability_schedules']['Row']>;
        Update: Partial<Database['public']['Tables']['availability_schedules']['Row']>;
        Relationships: TableRelationship[];
      };
      availability_rules: {
        Row: {
          id: string;
          schedule_id: string;
          day_of_week: number;
          start_time: string;
          end_time: string;
          fixed_start_times?: string[] | null;
        };
        Insert: Pick<
          Database['public']['Tables']['availability_rules']['Row'],
          'schedule_id' | 'day_of_week' | 'start_time' | 'end_time'
        > &
          Partial<Database['public']['Tables']['availability_rules']['Row']>;
        Update: Partial<Database['public']['Tables']['availability_rules']['Row']>;
        Relationships: TableRelationship[];
      };
      date_overrides: {
        Row: {
          id: string;
          staff_id: string;
          override_date: string;
          is_unavailable: boolean;
          start_time: string | null;
          end_time: string | null;
          reason: string;
          public_note?: string | null;
          redirect_staff_id?: string | null;
          created_at: string;
        };
        Insert: Pick<
          Database['public']['Tables']['date_overrides']['Row'],
          'staff_id' | 'override_date'
        > &
          Partial<Database['public']['Tables']['date_overrides']['Row']>;
        Update: Partial<Database['public']['Tables']['date_overrides']['Row']>;
        Relationships: TableRelationship[];
      };
      calendar_connections: {
        Row: {
          id: string;
          staff_id: string;
          provider: 'google';
          account_email: string;
          access_token_encrypted: string | null;
          refresh_token_encrypted: string | null;
          token_expires_at: string | null;
          destination_calendar_id: string;
          conflict_calendar_ids: string[];
          available_calendars: Json;
          external_busy_blocks: Json;
          watch_channel_id: string | null;
          watch_resource_id: string | null;
          watch_expiration: string | null;
          is_connected: boolean;
          last_synced_at: string | null;
          updated_at: string;
        };
        Insert: Pick<
          Database['public']['Tables']['calendar_connections']['Row'],
          'staff_id' | 'account_email'
        > &
          Partial<Database['public']['Tables']['calendar_connections']['Row']>;
        Update: Partial<Database['public']['Tables']['calendar_connections']['Row']>;
        Relationships: TableRelationship[];
      };
      clients: {
        Row: {
          id: string;
          full_name: string;
          phone_e164: string;
          email: string | null;
          instagram_handle?: string | null;
          birthday: string | null;
          notes: string;
          no_show_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Pick<
          Database['public']['Tables']['clients']['Row'],
          'full_name' | 'phone_e164'
        > &
          Partial<Database['public']['Tables']['clients']['Row']>;
        Update: Partial<Database['public']['Tables']['clients']['Row']>;
        Relationships: TableRelationship[];
      };
      slot_holds: {
        Row: {
          id: string;
          staff_id: string;
          service_id: string;
          session_token: string;
          start_at: string;
          end_at: string;
          held_range: string;
          expires_at: string;
          created_at: string;
        };
        Insert: Pick<
          Database['public']['Tables']['slot_holds']['Row'],
          'staff_id' | 'service_id' | 'session_token' | 'start_at' | 'end_at' | 'held_range' | 'expires_at'
        > &
          Partial<Database['public']['Tables']['slot_holds']['Row']>;
        Update: Partial<Database['public']['Tables']['slot_holds']['Row']>;
        Relationships: TableRelationship[];
      };
      bookings: {
        Row: {
          id: string;
          booking_code: string;
          manage_token: string;
          idempotency_key: string | null;
          service_id: string;
          extra_service_ids?: string[];
          staff_id: string;
          client_id: string;
          client_instagram?: string | null;
          start_at: string;
          end_at: string;
          occupied_start_at: string;
          occupied_end_at: string;
          occupied_range: string;
          total_duration_minutes: number;
          custom_duration_minutes?: number | null;
          subtotal_cents: number;
          discount_cents: number;
          total_price_cents: number;
          custom_price_cents?: number | null;
          deposit_amount_cents: number;
          coupon_code: string | null;
          status:
            | 'pending_payment'
            | 'pending_confirmation'
            | 'confirmed'
            | 'completed'
            | 'canceled'
            | 'no_show';
          attendance_status?: 'pending' | 'confirmed' | 'rescheduled';
          attendance_confirmed_at?: string | null;
          reminder_24h_sent_at?: string | null;
          source: 'web' | 'whatsapp' | 'manual' | 'walk_in';
          client_notes: string;
          internal_notes: string;
          inspo_photo_url: string | null;
          payment_proof_url: string | null;
          proof_delivery_method?: 'web_upload' | 'web_link' | 'instagram_dm' | 'none';
          proof_rejected_at?: string | null;
          proof_rejection_reason?: string | null;
          touchup_invited_at?: string | null;
          google_event_id: string | null;
          cancellation_reason: string | null;
          rescheduled_from_id: string | null;
          confirmed_via?: 'manual' | 'email' | 'whatsapp' | 'payment' | null;
          checkout_url?: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Pick<
          Database['public']['Tables']['bookings']['Row'],
          | 'booking_code'
          | 'manage_token'
          | 'service_id'
          | 'staff_id'
          | 'client_id'
          | 'start_at'
          | 'end_at'
          | 'occupied_start_at'
          | 'occupied_end_at'
          | 'occupied_range'
          | 'total_duration_minutes'
          | 'total_price_cents'
        > &
          Partial<Database['public']['Tables']['bookings']['Row']>;
        Update: Partial<Database['public']['Tables']['bookings']['Row']>;
        Relationships: TableRelationship[];
      };
      booking_addons: {
        Row: {
          id: string;
          booking_id: string;
          addon_id: string | null;
          name_snapshot: string;
          extra_minutes: number;
          extra_price_cents: number;
        };
        Insert: Pick<
          Database['public']['Tables']['booking_addons']['Row'],
          'booking_id' | 'name_snapshot'
        > &
          Partial<Database['public']['Tables']['booking_addons']['Row']>;
        Update: Partial<Database['public']['Tables']['booking_addons']['Row']>;
        Relationships: TableRelationship[];
      };
      booking_payments: {
        Row: {
          id: string;
          booking_id: string;
          provider: 'manual_transfer' | 'stripe' | 'mercadopago';
          provider_payment_id: string | null;
          amount_cents: number;
          currency: string;
          status: 'pending' | 'paid' | 'refunded' | 'failed';
          proof_url: string | null;
          checkout_url?: string | null;
          paid_at: string | null;
          created_at: string;
        };
        Insert: Pick<
          Database['public']['Tables']['booking_payments']['Row'],
          'booking_id' | 'provider' | 'amount_cents'
        > &
          Partial<Database['public']['Tables']['booking_payments']['Row']>;
        Update: Partial<Database['public']['Tables']['booking_payments']['Row']>;
        Relationships: TableRelationship[];
      };
      notification_workflows: {
        Row: {
          id: string;
          name: string;
          trigger_event:
            | 'booking_created'
            | 'booking_confirmed'
            | 'booking_canceled'
            | 'booking_rescheduled'
            | 'before_booking'
            | 'after_booking';
          offset_minutes: number;
          channels: string[];
          is_enabled: boolean;
          subject_template: string;
          message_template: string;
          updated_at: string;
        };
        Insert: Pick<
          Database['public']['Tables']['notification_workflows']['Row'],
          'name' | 'trigger_event'
        > &
          Partial<Database['public']['Tables']['notification_workflows']['Row']>;
        Update: Partial<Database['public']['Tables']['notification_workflows']['Row']>;
        Relationships: TableRelationship[];
      };
      scheduled_notifications: {
        Row: {
          id: string;
          booking_id: string | null;
          client_id: string | null;
          workflow_id: string | null;
          trigger_key: string | null;
          channel: 'email' | 'whatsapp' | 'sms';
          recipient: string;
          scheduled_for: string;
          status: 'pending' | 'sent' | 'failed' | 'canceled';
          delivery_status: 'queued' | 'sent' | 'delivered' | 'read' | 'failed' | null;
          subject: string;
          preview_text: string;
          body_text: string;
          payload: Json;
          provider_message_id: string | null;
          error_message: string | null;
          attempts: number;
          max_attempts: number;
          next_retry_at: string | null;
          last_attempt_at: string | null;
          sent_at: string | null;
          created_at: string;
        };
        Insert: Pick<
          Database['public']['Tables']['scheduled_notifications']['Row'],
          'channel' | 'recipient' | 'scheduled_for'
        > &
          Partial<Database['public']['Tables']['scheduled_notifications']['Row']>;
        Update: Partial<Database['public']['Tables']['scheduled_notifications']['Row']>;
        Relationships: TableRelationship[];
      };
      whatsapp_sessions: {
        Row: {
          phone_e164: string;
          step: string;
          payload: Json;
          updated_at: string;
          expires_at: string;
        };
        Insert: Pick<Database['public']['Tables']['whatsapp_sessions']['Row'], 'phone_e164'> &
          Partial<Database['public']['Tables']['whatsapp_sessions']['Row']>;
        Update: Partial<Database['public']['Tables']['whatsapp_sessions']['Row']>;
        Relationships: TableRelationship[];
      };
      gallery_items: {
        Row: {
          id: string;
          title: string;
          caption: string;
          category: string;
          image_url: string;
          service_id: string | null;
          is_featured: boolean;
          display_order: number;
          created_at: string;
        };
        Insert: Pick<
          Database['public']['Tables']['gallery_items']['Row'],
          'title' | 'image_url'
        > &
          Partial<Database['public']['Tables']['gallery_items']['Row']>;
        Update: Partial<Database['public']['Tables']['gallery_items']['Row']>;
        Relationships: TableRelationship[];
      };
      coupons: {
        Row: {
          id: string;
          code: string;
          kind: 'coupon' | 'gift_card';
          discount_type: 'percent' | 'fixed_cents';
          discount_value: number;
          remaining_balance_cents: number | null;
          max_uses: number | null;
          used_count: number;
          min_subtotal_cents: number;
          expires_at: string | null;
          recipient_name: string | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: Pick<
          Database['public']['Tables']['coupons']['Row'],
          'code' | 'discount_type' | 'discount_value'
        > &
          Partial<Database['public']['Tables']['coupons']['Row']>;
        Update: Partial<Database['public']['Tables']['coupons']['Row']>;
        Relationships: TableRelationship[];
      };
      coupon_redemptions: {
        Row: {
          id: string;
          coupon_id: string;
          booking_id: string;
          client_id: string;
          amount_cents: number;
          status: 'active' | 'released';
          created_at: string;
          released_at?: string | null;
        };
        Insert: Pick<
          Database['public']['Tables']['coupon_redemptions']['Row'],
          'coupon_id' | 'booking_id' | 'client_id' | 'amount_cents'
        > &
          Partial<Database['public']['Tables']['coupon_redemptions']['Row']>;
        Update: Partial<Database['public']['Tables']['coupon_redemptions']['Row']>;
        Relationships: TableRelationship[];
      };
      waitlist_entries: {
        Row: {
          id: string;
          service_id: string;
          preferred_staff_id: string | null;
          desired_date: string;
          preferred_window: 'morning' | 'afternoon' | 'any';
          client_name: string;
          client_phone_e164: string;
          client_email: string | null;
          notes: string;
          status: 'waiting' | 'notified' | 'booked' | 'expired';
          notified_at: string | null;
          priority_offer_token?: string | null;
          priority_offer_expires_at?: string | null;
          priority_offer_slot_start_at?: string | null;
          priority_offer_staff_id?: string | null;
          created_at: string;
        };
        Insert: Pick<
          Database['public']['Tables']['waitlist_entries']['Row'],
          'service_id' | 'desired_date' | 'client_name' | 'client_phone_e164'
        > &
          Partial<Database['public']['Tables']['waitlist_entries']['Row']>;
        Update: Partial<Database['public']['Tables']['waitlist_entries']['Row']>;
        Relationships: TableRelationship[];
      };
      booking_reviews: {
        Row: {
          id: string;
          booking_id: string;
          client_id: string | null;
          staff_id: string | null;
          rating: number;
          comment: string;
          clicked_google_review: boolean;
          created_at: string;
        };
        Insert: Pick<
          Database['public']['Tables']['booking_reviews']['Row'],
          'booking_id' | 'rating'
        > &
          Partial<Database['public']['Tables']['booking_reviews']['Row']>;
        Update: Partial<Database['public']['Tables']['booking_reviews']['Row']>;
        Relationships: TableRelationship[];
      };
      inventory_items: {
        Row: {
          id: string;
          sku: string | null;
          name: string;
          category: 'Insumo' | 'Gel / Esmalte' | 'Acrílico' | 'Decoración' | 'Reventa';
          unit: string;
          stock_quantity: number;
          min_stock_alert: number;
          cost_cents: number;
          retail_price_cents: number;
          is_for_retail: boolean;
          is_active: boolean;
          updated_at: string;
        };
        Insert: Pick<Database['public']['Tables']['inventory_items']['Row'], 'name'> &
          Partial<Database['public']['Tables']['inventory_items']['Row']>;
        Update: Partial<Database['public']['Tables']['inventory_items']['Row']>;
        Relationships: TableRelationship[];
      };
      inventory_movements: {
        Row: {
          id: string;
          item_id: string;
          delta: number;
          reason: 'restock' | 'service_usage' | 'retail_sale' | 'adjustment';
          notes: string;
          booking_id: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: Pick<
          Database['public']['Tables']['inventory_movements']['Row'],
          'item_id' | 'delta' | 'reason'
        > &
          Partial<Database['public']['Tables']['inventory_movements']['Row']>;
        Update: Partial<Database['public']['Tables']['inventory_movements']['Row']>;
        Relationships: TableRelationship[];
      };
      cash_register_entries: {
        Row: {
          id: string;
          booking_id: string | null;
          staff_id: string | null;
          entry_type:
            | 'service_income'
            | 'product_sale'
            | 'deposit'
            | 'expense'
            | 'gift_card_sale';
          description: string;
          amount_cents: number;
          tip_cents: number;
          commission_cents: number;
          payment_method: 'cash' | 'transfer' | 'card' | 'gift_card';
          occurred_at: string;
          recorded_by: string | null;
          created_at: string;
        };
        Insert: Pick<
          Database['public']['Tables']['cash_register_entries']['Row'],
          'entry_type' | 'description' | 'amount_cents' | 'payment_method'
        > &
          Partial<Database['public']['Tables']['cash_register_entries']['Row']>;
        Update: Partial<Database['public']['Tables']['cash_register_entries']['Row']>;
        Relationships: TableRelationship[];
      };
      public_busy_intervals: {
        Row: {
          id: string;
          source_kind: 'booking' | 'slot_hold';
          source_id: string;
          staff_id: string;
          occupied_range: string;
          slot_date: string;
          updated_at: string;
        };
        Insert: Pick<
          Database['public']['Tables']['public_busy_intervals']['Row'],
          'source_kind' | 'source_id' | 'staff_id' | 'occupied_range' | 'slot_date'
        > &
          Partial<Database['public']['Tables']['public_busy_intervals']['Row']>;
        Update: Partial<Database['public']['Tables']['public_busy_intervals']['Row']>;
        Relationships: TableRelationship[];
      };
      outbox_events: {
        Row: {
          id: string;
          event_type: string;
          payload: Json;
          status: 'pending' | 'processing' | 'processed' | 'failed';
          attempts: number;
          available_at: string;
          processed_at: string | null;
          last_error: string | null;
          created_at: string;
        };
        Insert: Pick<Database['public']['Tables']['outbox_events']['Row'], 'event_type'> &
          Partial<Database['public']['Tables']['outbox_events']['Row']>;
        Update: Partial<Database['public']['Tables']['outbox_events']['Row']>;
        Relationships: TableRelationship[];
      };
      payment_splits: {
        Row: {
          id: string;
          booking_id: string;
          method: 'cash' | 'card' | 'transfer' | 'giftcard' | 'online';
          amount_cents: number;
          tip_cents: number;
          tip_staff_id: string | null;
          reference: string | null;
          created_at: string;
        };
        Insert: Pick<
          Database['public']['Tables']['payment_splits']['Row'],
          'booking_id' | 'method' | 'amount_cents'
        > &
          Partial<Database['public']['Tables']['payment_splits']['Row']>;
        Update: Partial<Database['public']['Tables']['payment_splits']['Row']>;
        Relationships: TableRelationship[];
      };
      recurring_blocks: {
        Row: {
          id: string;
          staff_id: string;
          reason: string;
          frequency: 'weekly' | 'monthly';
          weekdays: number[];
          day_of_month: number | null;
          start_time: string;
          end_time: string;
          until_date: string | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: Pick<
          Database['public']['Tables']['recurring_blocks']['Row'],
          'staff_id' | 'frequency' | 'start_time' | 'end_time'
        > &
          Partial<Database['public']['Tables']['recurring_blocks']['Row']>;
        Update: Partial<Database['public']['Tables']['recurring_blocks']['Row']>;
        Relationships: TableRelationship[];
      };
      loyalty_programs: {
        Row: {
          id: string;
          is_active: boolean;
          name: string;
          stamps_required: number;
          reward_type: 'free_service' | 'percent_discount';
          reward_service_id: string | null;
          discount_percent: number | null;
          max_discount_cents: number | null;
          valid_days: number | null;
          created_at: string;
        };
        Insert: Pick<
          Database['public']['Tables']['loyalty_programs']['Row'],
          'name' | 'reward_type'
        > &
          Partial<Database['public']['Tables']['loyalty_programs']['Row']>;
        Update: Partial<Database['public']['Tables']['loyalty_programs']['Row']>;
        Relationships: TableRelationship[];
      };
      loyalty_stamps: {
        Row: {
          id: string;
          client_id: string;
          booking_id: string;
          program_id: string;
          stamped_date: string;
          created_at: string;
        };
        Insert: Pick<
          Database['public']['Tables']['loyalty_stamps']['Row'],
          'client_id' | 'booking_id' | 'program_id' | 'stamped_date'
        > &
          Partial<Database['public']['Tables']['loyalty_stamps']['Row']>;
        Update: Partial<Database['public']['Tables']['loyalty_stamps']['Row']>;
        Relationships: TableRelationship[];
      };
      consents: {
        Row: {
          id: string;
          client_id: string;
          booking_id: string | null;
          policy_version: string;
          accepted_at: string;
          marketing_opt_in: boolean;
        };
        Insert: Pick<
          Database['public']['Tables']['consents']['Row'],
          'client_id' | 'policy_version'
        > &
          Partial<Database['public']['Tables']['consents']['Row']>;
        Update: Partial<Database['public']['Tables']['consents']['Row']>;
        Relationships: TableRelationship[];
      };
      audit_logs: {
        Row: {
          id: string;
          actor_id: string;
          actor_email: string;
          actor_role: 'owner' | 'admin' | 'specialist';
          action:
            | 'booking_canceled'
            | 'booking_price_override'
            | 'csv_exported'
            | 'past_booking_override'
            | 'deposit_approved'
            | 'deposit_rejected'
            | 'booking_rescheduled'
            | 'loyalty_redeemed'
            | 'media_retention_warned'
            | 'media_retention_purged'
            | 'whatsapp_message_sent'
            | 'reminder_retried'
            | 'workflow_updated';
          entity_type: string;
          entity_id: string;
          metadata: Json;
          created_at: string;
        };
        Insert: Pick<
          Database['public']['Tables']['audit_logs']['Row'],
          'actor_id' | 'actor_email' | 'actor_role' | 'action' | 'entity_type' | 'entity_id'
        > &
          Partial<Database['public']['Tables']['audit_logs']['Row']>;
        Update: Partial<Database['public']['Tables']['audit_logs']['Row']>;
        Relationships: TableRelationship[];
      };
      media_assets: {
        Row: {
          id: string;
          storage_path: string;
          folder: 'proofs' | 'inspo' | 'gallery';
          booking_id: string | null;
          client_id: string | null;
          content_type: string;
          size_bytes: number;
          created_at: string;
          retention_warned_30d_at: string | null;
          retention_warned_7d_at: string | null;
          purged_at: string | null;
        };
        Insert: Pick<
          Database['public']['Tables']['media_assets']['Row'],
          'storage_path' | 'folder' | 'content_type' | 'size_bytes'
        > &
          Partial<Database['public']['Tables']['media_assets']['Row']>;
        Update: Partial<Database['public']['Tables']['media_assets']['Row']>;
        Relationships: TableRelationship[];
      };
      whatsapp_templates: {
        Row: {
          id: string;
          trigger_key: string;
          template_name: string;
          category: 'UTILITY' | 'MARKETING' | 'AUTHENTICATION';
          language_code: string;
          is_active: boolean;
          updated_at: string;
        };
        Insert: Pick<
          Database['public']['Tables']['whatsapp_templates']['Row'],
          'trigger_key' | 'template_name'
        > &
          Partial<Database['public']['Tables']['whatsapp_templates']['Row']>;
        Update: Partial<Database['public']['Tables']['whatsapp_templates']['Row']>;
        Relationships: TableRelationship[];
      };
      whatsapp_monthly_usage: {
        Row: {
          month_key: string;
          sent_count: number;
          quota_limit: number;
          warned_80_at: string | null;
          warned_100_at: string | null;
          updated_at: string;
        };
        Insert: Pick<
          Database['public']['Tables']['whatsapp_monthly_usage']['Row'],
          'month_key'
        > &
          Partial<Database['public']['Tables']['whatsapp_monthly_usage']['Row']>;
        Update: Partial<Database['public']['Tables']['whatsapp_monthly_usage']['Row']>;
        Relationships: TableRelationship[];
      };
      whatsapp_threads: {
        Row: {
          id: string;
          phone_e164: string;
          client_id: string | null;
          contact_name: string;
          last_message_at: string | null;
          last_message_preview: string;
          last_message_direction: 'inbound' | 'outbound' | 'echo' | null;
          last_inbound_at: string | null;
          unread_count: number;
          last_read_at: string | null;
          has_failed_messages: boolean;
          is_archived: boolean;
          assigned_staff_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Pick<
          Database['public']['Tables']['whatsapp_threads']['Row'],
          'phone_e164'
        > &
          Partial<Database['public']['Tables']['whatsapp_threads']['Row']>;
        Update: Partial<Database['public']['Tables']['whatsapp_threads']['Row']>;
        Relationships: TableRelationship[];
      };
      whatsapp_messages: {
        Row: {
          id: string;
          thread_id: string;
          phone_e164: string;
          client_id: string | null;
          booking_id: string | null;
          notification_id: string | null;
          direction: 'inbound' | 'outbound' | 'echo';
          sender_kind: 'client' | 'staff' | 'automation' | 'coexistence_phone';
          sender_name: string | null;
          message_type: 'text' | 'template' | 'interactive' | 'button' | 'media' | 'system';
          body_text: string;
          template_name: string | null;
          template_trigger_key: string | null;
          template_params: Json;
          delivery_status: 'queued' | 'sent' | 'delivered' | 'read' | 'failed' | 'received';
          delivery_mode:
            | 'template'
            | 'text'
            | 'fallback_email_wame'
            | 'demo'
            | 'coexistence'
            | 'inbound';
          provider_message_id: string | null;
          error_code: string | null;
          error_message: string | null;
          sent_at: string | null;
          delivered_at: string | null;
          read_at: string | null;
          failed_at: string | null;
          created_at: string;
        };
        Insert: Pick<
          Database['public']['Tables']['whatsapp_messages']['Row'],
          'thread_id' | 'phone_e164' | 'direction' | 'sender_kind' | 'delivery_status'
        > &
          Partial<Database['public']['Tables']['whatsapp_messages']['Row']>;
        Update: Partial<Database['public']['Tables']['whatsapp_messages']['Row']>;
        Relationships: TableRelationship[];
      };
      webhook_events: {
        Row: {
          provider: string;
          event_id: string;
          received_at: string;
        };
        Insert: Pick<
          Database['public']['Tables']['webhook_events']['Row'],
          'provider' | 'event_id'
        > &
          Partial<Database['public']['Tables']['webhook_events']['Row']>;
        Update: Partial<Database['public']['Tables']['webhook_events']['Row']>;
        Relationships: TableRelationship[];
      };
      funnel_events: {
        Row: {
          id: string;
          session_id: string;
          event_type:
            | 'page_view'
            | 'booking_started'
            | 'slot_held'
            | 'details_completed'
            | 'deposit_submitted'
            | 'booking_confirmed';
          service_slug: string | null;
          staff_slug: string | null;
          created_at: string;
        };
        Insert: Pick<
          Database['public']['Tables']['funnel_events']['Row'],
          'session_id' | 'event_type'
        > &
          Partial<Database['public']['Tables']['funnel_events']['Row']>;
        Update: Partial<Database['public']['Tables']['funnel_events']['Row']>;
        Relationships: TableRelationship[];
      };
    };
    Views: {
      public_busy_overrides: {
        Row: {
          id: string;
          staff_id: string;
          override_date: string;
          is_unavailable: boolean;
          start_time: string | null;
          end_time: string | null;
          public_note?: string | null;
          redirect_staff_id?: string | null;
        };
        Relationships: TableRelationship[];
      };
    };
    Functions: {
      create_booking_atomic: {
        Args: {
          p_booking_code: string;
          p_manage_token: string;
          p_idempotency_key: string | null;
          p_service_id: string;
          p_staff_id: string;
          p_client_id: string;
          p_start_at: string;
          p_end_at: string;
          p_occupied_start_at: string;
          p_occupied_end_at: string;
          p_total_duration_minutes: number;
          p_subtotal_cents: number;
          p_discount_cents: number;
          p_total_price_cents: number;
          p_deposit_amount_cents: number;
          p_coupon_code: string | null;
          p_coupon_id: string | null;
          p_status: string;
          p_source: string;
          p_client_notes: string;
          p_inspo_photo_url: string | null;
          p_payment_proof_url: string | null;
          p_hold_id: string | null;
          p_session_token: string | null;
          p_addons?: Json;
        };
        Returns: string;
      };
      current_admin_role: {
        Args: Record<string, never>;
        Returns: string | null;
      };
      current_admin_staff_id: {
        Args: Record<string, never>;
        Returns: string | null;
      };
      purge_expired_slot_holds: {
        Args: Record<string, never>;
        Returns: number;
      };
      increment_whatsapp_usage: {
        Args: {
          p_month_key: string;
          p_quota_limit?: number;
          p_increment?: number;
        };
        Returns: Array<{
          month_key: string;
          sent_count: number;
          quota_limit: number;
          warned_80_at: string | null;
          warned_100_at: string | null;
          updated_at: string;
        }>;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
