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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      candidate_projects: {
        Row: {
          agent_confidence: number
          agent_notes: string | null
          approximate_date_note: string | null
          budget_inr: number | null
          category: string | null
          citations: Json
          completion_date: string | null
          created_at: string
          department: string | null
          discovered_from: string | null
          district: string | null
          id: string
          is_anonymous: boolean
          location_text: string | null
          moderation_label: string | null
          moderation_notes: string | null
          moderation_state: Database["public"]["Enums"]["moderation_state"]
          name: string
          observed_condition: string | null
          origin: string
          photos: Json
          plain_summary: string | null
          proposed_status: Database["public"]["Enums"]["project_status"] | null
          published_project_id: string | null
          review_state: Database["public"]["Enums"]["candidate_state"]
          reviewer_id: string | null
          reviewer_notes: string | null
          state: string | null
          submitted_by: string | null
          submitter_name: string | null
          updated_at: string
        }
        Insert: {
          agent_confidence?: number
          agent_notes?: string | null
          approximate_date_note?: string | null
          budget_inr?: number | null
          category?: string | null
          citations?: Json
          completion_date?: string | null
          created_at?: string
          department?: string | null
          discovered_from?: string | null
          district?: string | null
          id?: string
          is_anonymous?: boolean
          location_text?: string | null
          moderation_label?: string | null
          moderation_notes?: string | null
          moderation_state?: Database["public"]["Enums"]["moderation_state"]
          name: string
          observed_condition?: string | null
          origin?: string
          photos?: Json
          plain_summary?: string | null
          proposed_status?: Database["public"]["Enums"]["project_status"] | null
          published_project_id?: string | null
          review_state?: Database["public"]["Enums"]["candidate_state"]
          reviewer_id?: string | null
          reviewer_notes?: string | null
          state?: string | null
          submitted_by?: string | null
          submitter_name?: string | null
          updated_at?: string
        }
        Update: {
          agent_confidence?: number
          agent_notes?: string | null
          approximate_date_note?: string | null
          budget_inr?: number | null
          category?: string | null
          citations?: Json
          completion_date?: string | null
          created_at?: string
          department?: string | null
          discovered_from?: string | null
          district?: string | null
          id?: string
          is_anonymous?: boolean
          location_text?: string | null
          moderation_label?: string | null
          moderation_notes?: string | null
          moderation_state?: Database["public"]["Enums"]["moderation_state"]
          name?: string
          observed_condition?: string | null
          origin?: string
          photos?: Json
          plain_summary?: string | null
          proposed_status?: Database["public"]["Enums"]["project_status"] | null
          published_project_id?: string | null
          review_state?: Database["public"]["Enums"]["candidate_state"]
          reviewer_id?: string | null
          reviewer_notes?: string | null
          state?: string | null
          submitted_by?: string | null
          submitter_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_projects_published_project_id_fkey"
            columns: ["published_project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
        }
        Relationships: []
      }
      project_milestones: {
        Row: {
          description: string | null
          event_date: string | null
          id: string
          is_verified: boolean
          project_id: string
          sort_order: number
          source_id: string | null
          title: string
        }
        Insert: {
          description?: string | null
          event_date?: string | null
          id?: string
          is_verified?: boolean
          project_id: string
          sort_order?: number
          source_id?: string | null
          title: string
        }
        Update: {
          description?: string | null
          event_date?: string | null
          id?: string
          is_verified?: boolean
          project_id?: string
          sort_order?: number
          source_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_milestones_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_milestones_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "project_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      project_sources: {
        Row: {
          confidence: number
          created_at: string
          extracted_evidence: string | null
          id: string
          last_verified_at: string | null
          project_id: string
          publisher: string | null
          source_type: Database["public"]["Enums"]["source_type"]
          title: string
          url: string
          verification_status: Database["public"]["Enums"]["verify_status"]
        }
        Insert: {
          confidence?: number
          created_at?: string
          extracted_evidence?: string | null
          id?: string
          last_verified_at?: string | null
          project_id: string
          publisher?: string | null
          source_type: Database["public"]["Enums"]["source_type"]
          title: string
          url: string
          verification_status?: Database["public"]["Enums"]["verify_status"]
        }
        Update: {
          confidence?: number
          created_at?: string
          extracted_evidence?: string | null
          id?: string
          last_verified_at?: string | null
          project_id?: string
          publisher?: string | null
          source_type?: Database["public"]["Enums"]["source_type"]
          title?: string
          url?: string
          verification_status?: Database["public"]["Enums"]["verify_status"]
        }
        Relationships: [
          {
            foreignKeyName: "project_sources_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          actual_end_date: string | null
          budget_inr: number | null
          community_note: string | null
          confidence: number
          created_at: string
          department: string | null
          details: string | null
          district: string | null
          id: string
          last_verified_at: string | null
          latitude: number | null
          longitude: number | null
          name: string
          plain_summary: string
          planned_end_date: string | null
          published: boolean
          sector: string | null
          source_origin: string
          start_date: string | null
          state: string | null
          status: Database["public"]["Enums"]["project_status"]
          updated_at: string
          verification_status: Database["public"]["Enums"]["verify_status"]
        }
        Insert: {
          actual_end_date?: string | null
          budget_inr?: number | null
          community_note?: string | null
          confidence?: number
          created_at?: string
          department?: string | null
          details?: string | null
          district?: string | null
          id?: string
          last_verified_at?: string | null
          latitude?: number | null
          longitude?: number | null
          name: string
          plain_summary: string
          planned_end_date?: string | null
          published?: boolean
          sector?: string | null
          source_origin?: string
          start_date?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
          verification_status?: Database["public"]["Enums"]["verify_status"]
        }
        Update: {
          actual_end_date?: string | null
          budget_inr?: number | null
          community_note?: string | null
          confidence?: number
          created_at?: string
          department?: string | null
          details?: string | null
          district?: string | null
          id?: string
          last_verified_at?: string | null
          latitude?: number | null
          longitude?: number | null
          name?: string
          plain_summary?: string
          planned_end_date?: string | null
          published?: boolean
          sector?: string | null
          source_origin?: string
          start_date?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
          verification_status?: Database["public"]["Enums"]["verify_status"]
        }
        Relationships: []
      }
      review_images: {
        Row: {
          caption: string | null
          created_at: string
          id: string
          image_url: string
          moderation_label: string | null
          moderation_state: Database["public"]["Enums"]["moderation_state"]
          review_id: string
          user_id: string | null
        }
        Insert: {
          caption?: string | null
          created_at?: string
          id?: string
          image_url: string
          moderation_label?: string | null
          moderation_state?: Database["public"]["Enums"]["moderation_state"]
          review_id: string
          user_id?: string | null
        }
        Update: {
          caption?: string | null
          created_at?: string
          id?: string
          image_url?: string
          moderation_label?: string | null
          moderation_state?: Database["public"]["Enums"]["moderation_state"]
          review_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "review_images_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_images_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "reviews_public"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          author_name: string | null
          body: string | null
          condition: string | null
          created_at: string
          id: string
          is_anonymous: boolean
          masked_body: string | null
          moderation_label: string | null
          moderation_notes: string | null
          moderation_state: Database["public"]["Enums"]["moderation_state"]
          project_id: string
          rating: number
          user_id: string | null
        }
        Insert: {
          author_name?: string | null
          body?: string | null
          condition?: string | null
          created_at?: string
          id?: string
          is_anonymous?: boolean
          masked_body?: string | null
          moderation_label?: string | null
          moderation_notes?: string | null
          moderation_state?: Database["public"]["Enums"]["moderation_state"]
          project_id: string
          rating: number
          user_id?: string | null
        }
        Update: {
          author_name?: string | null
          body?: string | null
          condition?: string | null
          created_at?: string
          id?: string
          is_anonymous?: boolean
          masked_body?: string | null
          moderation_label?: string | null
          moderation_notes?: string | null
          moderation_state?: Database["public"]["Enums"]["moderation_state"]
          project_id?: string
          rating?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reviews_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      review_images_public: {
        Row: {
          caption: string | null
          id: string | null
          image_url: string | null
          moderation_label: string | null
          moderation_state:
            | Database["public"]["Enums"]["moderation_state"]
            | null
          review_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "review_images_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_images_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "reviews_public"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews_public: {
        Row: {
          author_name: string | null
          condition: string | null
          created_at: string | null
          id: string | null
          is_anonymous: boolean | null
          masked_body: string | null
          moderation_label: string | null
          moderation_state:
            | Database["public"]["Enums"]["moderation_state"]
            | null
          project_id: string | null
          rating: number | null
        }
        Relationships: [
          {
            foreignKeyName: "reviews_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_reviewer: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "reviewer" | "user"
      candidate_state: "discovered" | "in_review" | "approved" | "rejected"
      moderation_state: "visible" | "held" | "blurred" | "removed"
      project_status:
        | "planned"
        | "ongoing"
        | "delayed"
        | "completed"
        | "finished_early"
      source_type:
        | "government_portal"
        | "tender_document"
        | "budget_document"
        | "press_release"
        | "audit_report"
        | "news_report"
        | "rti_response"
      verify_status: "unverified" | "pending_review" | "verified" | "rejected"
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
      app_role: ["admin", "reviewer", "user"],
      candidate_state: ["discovered", "in_review", "approved", "rejected"],
      moderation_state: ["visible", "held", "blurred", "removed"],
      project_status: [
        "planned",
        "ongoing",
        "delayed",
        "completed",
        "finished_early",
      ],
      source_type: [
        "government_portal",
        "tender_document",
        "budget_document",
        "press_release",
        "audit_report",
        "news_report",
        "rti_response",
      ],
      verify_status: ["unverified", "pending_review", "verified", "rejected"],
    },
  },
} as const
