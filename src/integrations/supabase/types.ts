export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      campaigns: {
        Row: {
          brand: string
          campaign_name: string
          client_id: string
          created_at: string
          id: string
          market: string
          notes: string
          schedule_month: string | null
          updated_at: string
        }
        Insert: {
          brand?: string
          campaign_name: string
          client_id: string
          created_at?: string
          id?: string
          market?: string
          notes?: string
          schedule_month?: string | null
          updated_at?: string
        }
        Update: {
          brand?: string
          campaign_name?: string
          client_id?: string
          created_at?: string
          id?: string
          market?: string
          notes?: string
          schedule_month?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_client_rates: {
        Row: {
          active: boolean
          channel_id: string
          client_id: string | null
          client_label: string
          created_at: string
          effective_from: string | null
          effective_to: string | null
          id: string
          nett_rate: number
          notes: string
          timeband: string
        }
        Insert: {
          active?: boolean
          channel_id: string
          client_id?: string | null
          client_label?: string
          created_at?: string
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          nett_rate?: number
          notes?: string
          timeband?: string
        }
        Update: {
          active?: boolean
          channel_id?: string
          client_id?: string | null
          client_label?: string
          created_at?: string
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          nett_rate?: number
          notes?: string
          timeband?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_client_rates_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_client_rates_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      channels: {
        Row: {
          active: boolean
          address_line1: string
          address_line2: string
          address_line3: string
          aliases: string[]
          cc_email: string
          channel_name: string
          city: string
          contact_person: string
          created_at: string
          default_nett_rate: number | null
          gstin: string
          id: string
          language: string
          legal_company_name: string
          media_type: string
          notes: string
          pan: string
          phone: string
          pin_code: string
          place_of_supply: string
          ro_email: string
          state: string
          state_code: string
          station: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          address_line1?: string
          address_line2?: string
          address_line3?: string
          aliases?: string[]
          cc_email?: string
          channel_name: string
          city?: string
          contact_person?: string
          created_at?: string
          default_nett_rate?: number | null
          gstin?: string
          id?: string
          language?: string
          legal_company_name?: string
          media_type?: string
          notes?: string
          pan?: string
          phone?: string
          pin_code?: string
          place_of_supply?: string
          ro_email?: string
          state?: string
          state_code?: string
          station?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          address_line1?: string
          address_line2?: string
          address_line3?: string
          aliases?: string[]
          cc_email?: string
          channel_name?: string
          city?: string
          contact_person?: string
          created_at?: string
          default_nett_rate?: number | null
          gstin?: string
          id?: string
          language?: string
          legal_company_name?: string
          media_type?: string
          notes?: string
          pan?: string
          phone?: string
          pin_code?: string
          place_of_supply?: string
          ro_email?: string
          state?: string
          state_code?: string
          station?: string
          updated_at?: string
        }
        Relationships: []
      }
      clients: {
        Row: {
          active: boolean
          address_line1: string
          address_line2: string
          address_line3: string
          cc_email: string
          city: string
          client_name: string
          contact_person: string
          courier_address: string
          created_at: string
          email: string
          gstin: string
          id: string
          legal_name: string
          notes: string
          pan: string
          phone: string
          pin_code: string
          service_charge_percent: number | null
          state: string
          state_code: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          address_line1?: string
          address_line2?: string
          address_line3?: string
          cc_email?: string
          city?: string
          client_name: string
          contact_person?: string
          courier_address?: string
          created_at?: string
          email?: string
          gstin?: string
          id?: string
          legal_name?: string
          notes?: string
          pan?: string
          phone?: string
          pin_code?: string
          service_charge_percent?: number | null
          state?: string
          state_code?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          address_line1?: string
          address_line2?: string
          address_line3?: string
          cc_email?: string
          city?: string
          client_name?: string
          contact_person?: string
          courier_address?: string
          created_at?: string
          email?: string
          gstin?: string
          id?: string
          legal_name?: string
          notes?: string
          pan?: string
          phone?: string
          pin_code?: string
          service_charge_percent?: number | null
          state?: string
          state_code?: string
          updated_at?: string
        }
        Relationships: []
      }
      company_books: {
        Row: {
          book_name: string
          created_at: string
          id: string
          is_open: boolean
          last_backup_at: string | null
          record_count: number
          snapshot: Json
          updated_at: string
        }
        Insert: {
          book_name?: string
          created_at?: string
          id?: string
          is_open?: boolean
          last_backup_at?: string | null
          record_count?: number
          snapshot?: Json
          updated_at?: string
        }
        Update: {
          book_name?: string
          created_at?: string
          id?: string
          is_open?: boolean
          last_backup_at?: string | null
          record_count?: number
          snapshot?: Json
          updated_at?: string
        }
        Relationships: []
      }
      company_settings: {
        Row: {
          address_line1: string
          address_line2: string
          bank_account_name: string
          bank_account_number: string
          bank_account_type: string
          bank_branch: string
          bank_ifsc: string
          bank_name: string
          cin: string
          city: string
          company_name: string
          created_at: string
          default_cgst: number
          default_financial_year: string
          default_igst: number
          default_invoice_terms: string
          default_proforma_terms: string
          default_ro_remarks: string
          default_service_charge_percent: number
          default_sgst: number
          default_special_instructions: string
          email: string
          footer_address: string
          gstin: string
          hsn_advertising: string
          hsn_tv_radio: string
          id: string
          invoice_format: Json
          invoice_prefix: string
          logo_url: string
          mail_draft_template: Json
          media_tax_settings: Json | null
          msme: string
          pan: string
          phone1: string
          phone2: string
          pin_code: string
          place_of_supply: string
          proforma_format: Json
          proforma_prefix: string
          ro_format: Json
          ro_prefix: string
          state: string
          state_code: string
          tan: string
          updated_at: string
          watermark_text: string
          website: string
        }
        Insert: {
          address_line1?: string
          address_line2?: string
          bank_account_name?: string
          bank_account_number?: string
          bank_account_type?: string
          bank_branch?: string
          bank_ifsc?: string
          bank_name?: string
          cin?: string
          city?: string
          company_name?: string
          created_at?: string
          default_cgst?: number
          default_financial_year?: string
          default_igst?: number
          default_invoice_terms?: string
          default_proforma_terms?: string
          default_ro_remarks?: string
          default_service_charge_percent?: number
          default_sgst?: number
          default_special_instructions?: string
          email?: string
          footer_address?: string
          gstin?: string
          hsn_advertising?: string
          hsn_tv_radio?: string
          id?: string
          invoice_format?: Json
          invoice_prefix?: string
          logo_url?: string
          mail_draft_template?: Json
          media_tax_settings?: Json | null
          msme?: string
          pan?: string
          phone1?: string
          phone2?: string
          pin_code?: string
          place_of_supply?: string
          proforma_format?: Json
          proforma_prefix?: string
          ro_format?: Json
          ro_prefix?: string
          state?: string
          state_code?: string
          tan?: string
          updated_at?: string
          watermark_text?: string
          website?: string
        }
        Update: {
          address_line1?: string
          address_line2?: string
          bank_account_name?: string
          bank_account_number?: string
          bank_account_type?: string
          bank_branch?: string
          bank_ifsc?: string
          bank_name?: string
          cin?: string
          city?: string
          company_name?: string
          created_at?: string
          default_cgst?: number
          default_financial_year?: string
          default_igst?: number
          default_invoice_terms?: string
          default_proforma_terms?: string
          default_ro_remarks?: string
          default_service_charge_percent?: number
          default_sgst?: number
          default_special_instructions?: string
          email?: string
          footer_address?: string
          gstin?: string
          hsn_advertising?: string
          hsn_tv_radio?: string
          id?: string
          invoice_format?: Json
          invoice_prefix?: string
          logo_url?: string
          mail_draft_template?: Json
          media_tax_settings?: Json | null
          msme?: string
          pan?: string
          phone1?: string
          phone2?: string
          pin_code?: string
          place_of_supply?: string
          proforma_format?: Json
          proforma_prefix?: string
          ro_format?: Json
          ro_prefix?: string
          state?: string
          state_code?: string
          tan?: string
          updated_at?: string
          watermark_text?: string
          website?: string
        }
        Relationships: []
      }
      desk_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          read_by: string[]
          sender_id: string | null
          sender_name: string
          thread: string
        }
        Insert: {
          body?: string
          created_at?: string
          id?: string
          read_by?: string[]
          sender_id?: string | null
          sender_name?: string
          thread?: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          read_by?: string[]
          sender_id?: string | null
          sender_name?: string
          thread?: string
        }
        Relationships: [
          {
            foreignKeyName: "desk_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "desk_users"
            referencedColumns: ["id"]
          },
        ]
      }
      desk_users: {
        Row: {
          created_at: string
          display_name: string
          id: string
          role_label: string
        }
        Insert: {
          created_at?: string
          display_name: string
          id?: string
          role_label?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          role_label?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          ack_date: string | null
          ack_no: string
          activity_month: string | null
          bank_json: Json
          brand: string
          campaign_id: string | null
          campaign_name: string
          cgst_amount: number
          cgst_rate: number
          client_id: string | null
          client_name: string
          courier_sent: boolean
          courier_sent_at: string | null
          created_at: string
          deleted_at: string | null
          einvoice_details_url: string
          einvoice_qr_url: string
          financial_year: string
          id: string
          igst_amount: number
          igst_rate: number
          invoice_date: string
          invoice_kind: string
          invoice_number: string
          invoice_sequence: number | null
          irn: string
          lines_json: Json
          mail_status: string
          pdf_generated_at: string | null
          proforma_id: string | null
          reference_number: string
          ro_ids: string[]
          round_off: number
          service_charge_amount: number
          service_charge_mode: string
          service_charge_value: number
          sgst_amount: number
          sgst_rate: number
          snapshot_json: Json
          status: Database["public"]["Enums"]["doc_status"]
          terms: string
          total_chargeable: number
          total_media_cost: number
          total_payable: number
          updated_at: string
        }
        Insert: {
          ack_date?: string | null
          ack_no?: string
          activity_month?: string | null
          bank_json?: Json
          brand?: string
          campaign_id?: string | null
          campaign_name?: string
          cgst_amount?: number
          cgst_rate?: number
          client_id?: string | null
          client_name?: string
          courier_sent?: boolean
          courier_sent_at?: string | null
          created_at?: string
          deleted_at?: string | null
          einvoice_details_url?: string
          einvoice_qr_url?: string
          financial_year?: string
          id?: string
          igst_amount?: number
          igst_rate?: number
          invoice_date?: string
          invoice_kind?: string
          invoice_number: string
          invoice_sequence?: number | null
          irn?: string
          lines_json?: Json
          mail_status?: string
          pdf_generated_at?: string | null
          proforma_id?: string | null
          reference_number?: string
          ro_ids?: string[]
          round_off?: number
          service_charge_amount?: number
          service_charge_mode?: string
          service_charge_value?: number
          sgst_amount?: number
          sgst_rate?: number
          snapshot_json?: Json
          status?: Database["public"]["Enums"]["doc_status"]
          terms?: string
          total_chargeable?: number
          total_media_cost?: number
          total_payable?: number
          updated_at?: string
        }
        Update: {
          ack_date?: string | null
          ack_no?: string
          activity_month?: string | null
          bank_json?: Json
          brand?: string
          campaign_id?: string | null
          campaign_name?: string
          cgst_amount?: number
          cgst_rate?: number
          client_id?: string | null
          client_name?: string
          courier_sent?: boolean
          courier_sent_at?: string | null
          created_at?: string
          deleted_at?: string | null
          einvoice_details_url?: string
          einvoice_qr_url?: string
          financial_year?: string
          id?: string
          igst_amount?: number
          igst_rate?: number
          invoice_date?: string
          invoice_kind?: string
          invoice_number?: string
          invoice_sequence?: number | null
          irn?: string
          lines_json?: Json
          mail_status?: string
          pdf_generated_at?: string | null
          proforma_id?: string | null
          reference_number?: string
          ro_ids?: string[]
          round_off?: number
          service_charge_amount?: number
          service_charge_mode?: string
          service_charge_value?: number
          sgst_amount?: number
          sgst_rate?: number
          snapshot_json?: Json
          status?: Database["public"]["Enums"]["doc_status"]
          terms?: string
          total_chargeable?: number
          total_media_cost?: number
          total_payable?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_proforma_id_fkey"
            columns: ["proforma_id"]
            isOneToOne: false
            referencedRelation: "proformas"
            referencedColumns: ["id"]
          },
        ]
      }
      proformas: {
        Row: {
          activity_month: string | null
          bank_json: Json
          brand: string
          campaign_id: string | null
          campaign_name: string
          cgst_amount: number
          cgst_rate: number
          client_id: string | null
          client_name: string
          created_at: string
          deleted_at: string | null
          financial_year: string
          id: string
          igst_amount: number
          igst_rate: number
          lines_json: Json
          payment_due: string
          payment_received: boolean
          payment_received_at: string | null
          pdf_generated_at: string | null
          proforma_date: string
          proforma_number: string
          proforma_sequence: number | null
          round_off: number
          service_charge_amount: number
          service_charge_mode: string
          service_charge_value: number
          sgst_amount: number
          sgst_rate: number
          snapshot_json: Json
          status: Database["public"]["Enums"]["doc_status"]
          sub_total: number
          taxable_value: number
          terms: string
          total_payable: number
          updated_at: string
        }
        Insert: {
          activity_month?: string | null
          bank_json?: Json
          brand?: string
          campaign_id?: string | null
          campaign_name?: string
          cgst_amount?: number
          cgst_rate?: number
          client_id?: string | null
          client_name?: string
          created_at?: string
          deleted_at?: string | null
          financial_year?: string
          id?: string
          igst_amount?: number
          igst_rate?: number
          lines_json?: Json
          payment_due?: string
          payment_received?: boolean
          payment_received_at?: string | null
          pdf_generated_at?: string | null
          proforma_date?: string
          proforma_number: string
          proforma_sequence?: number | null
          round_off?: number
          service_charge_amount?: number
          service_charge_mode?: string
          service_charge_value?: number
          sgst_amount?: number
          sgst_rate?: number
          snapshot_json?: Json
          status?: Database["public"]["Enums"]["doc_status"]
          sub_total?: number
          taxable_value?: number
          terms?: string
          total_payable?: number
          updated_at?: string
        }
        Update: {
          activity_month?: string | null
          bank_json?: Json
          brand?: string
          campaign_id?: string | null
          campaign_name?: string
          cgst_amount?: number
          cgst_rate?: number
          client_id?: string | null
          client_name?: string
          created_at?: string
          deleted_at?: string | null
          financial_year?: string
          id?: string
          igst_amount?: number
          igst_rate?: number
          lines_json?: Json
          payment_due?: string
          payment_received?: boolean
          payment_received_at?: string | null
          pdf_generated_at?: string | null
          proforma_date?: string
          proforma_number?: string
          proforma_sequence?: number | null
          round_off?: number
          service_charge_amount?: number
          service_charge_mode?: string
          service_charge_value?: number
          sgst_amount?: number
          sgst_rate?: number
          snapshot_json?: Json
          status?: Database["public"]["Enums"]["doc_status"]
          sub_total?: number
          taxable_value?: number
          terms?: string
          total_payable?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proformas_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proformas_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      release_orders: {
        Row: {
          bill_file_name: string | null
          bill_file_path: string | null
          bill_file_type: string | null
          bill_files: Json
          bill_received: boolean
          bill_received_at: string | null
          bill_text: string | null
          brand: string
          campaign_id: string | null
          campaign_name: string
          channel_id: string | null
          channel_name: string
          client_id: string | null
          client_name: string
          confirmed: boolean
          confirmed_at: string | null
          created_at: string
          deleted_at: string | null
          financial_year: string
          id: string
          mail_drafted_at: string | null
          mail_status: string
          media_type: string
          pdf_generated_at: string | null
          remarks: string
          ro_date: string
          ro_number: string
          ro_sequence: number | null
          rows_json: Json
          schedule_month: string | null
          snapshot_json: Json
          source: string
          special_instructions: string
          status: Database["public"]["Enums"]["doc_status"]
          tax_json: Json
          taxable_value: number
          total_payable: number
          totals_json: Json
          updated_at: string
        }
        Insert: {
          bill_file_name?: string | null
          bill_file_path?: string | null
          bill_file_type?: string | null
          bill_files?: Json
          bill_received?: boolean
          bill_received_at?: string | null
          bill_text?: string | null
          brand?: string
          campaign_id?: string | null
          campaign_name?: string
          channel_id?: string | null
          channel_name?: string
          client_id?: string | null
          client_name?: string
          confirmed?: boolean
          confirmed_at?: string | null
          created_at?: string
          deleted_at?: string | null
          financial_year?: string
          id?: string
          mail_drafted_at?: string | null
          mail_status?: string
          media_type?: string
          pdf_generated_at?: string | null
          remarks?: string
          ro_date?: string
          ro_number: string
          ro_sequence?: number | null
          rows_json?: Json
          schedule_month?: string | null
          snapshot_json?: Json
          source?: string
          special_instructions?: string
          status?: Database["public"]["Enums"]["doc_status"]
          tax_json?: Json
          taxable_value?: number
          total_payable?: number
          totals_json?: Json
          updated_at?: string
        }
        Update: {
          bill_file_name?: string | null
          bill_file_path?: string | null
          bill_file_type?: string | null
          bill_files?: Json
          bill_received?: boolean
          bill_received_at?: string | null
          bill_text?: string | null
          brand?: string
          campaign_id?: string | null
          campaign_name?: string
          channel_id?: string | null
          channel_name?: string
          client_id?: string | null
          client_name?: string
          confirmed?: boolean
          confirmed_at?: string | null
          created_at?: string
          deleted_at?: string | null
          financial_year?: string
          id?: string
          mail_drafted_at?: string | null
          mail_status?: string
          media_type?: string
          pdf_generated_at?: string | null
          remarks?: string
          ro_date?: string
          ro_number?: string
          ro_sequence?: number | null
          rows_json?: Json
          schedule_month?: string | null
          snapshot_json?: Json
          source?: string
          special_instructions?: string
          status?: Database["public"]["Enums"]["doc_status"]
          tax_json?: Json
          taxable_value?: number
          total_payable?: number
          totals_json?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "release_orders_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "release_orders_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "release_orders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      bulk_wipe_active: { Args: never; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_desk_admin: { Args: never; Returns: boolean }
      is_desk_staff: { Args: never; Returns: boolean }
      wipe_live_data: {
        Args: { include_settings: boolean }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "staff"
      doc_status:
        | "draft"
        | "ready"
        | "pdf_generated"
        | "modified_after_pdf"
        | "cancelled"
        | "paid"
        | "partially_paid"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "staff"],
      doc_status: [
        "draft",
        "ready",
        "pdf_generated",
        "modified_after_pdf",
        "cancelled",
        "paid",
        "partially_paid",
      ],
    },
  },
} as const
