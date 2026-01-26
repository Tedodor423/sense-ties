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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          description: string | null
          id: string
          key: string
          updated_at: string | null
          updated_by: string | null
          value: string
        }
        Insert: {
          description?: string | null
          id?: string
          key: string
          updated_at?: string | null
          updated_by?: string | null
          value: string
        }
        Update: {
          description?: string | null
          id?: string
          key?: string
          updated_at?: string | null
          updated_by?: string | null
          value?: string
        }
        Relationships: []
      }
      article_embeddings: {
        Row: {
          article_id: string
          chunk_index: number
          chunk_text: string
          created_at: string | null
          embedding: string | null
          id: string
        }
        Insert: {
          article_id: string
          chunk_index: number
          chunk_text: string
          created_at?: string | null
          embedding?: string | null
          id?: string
        }
        Update: {
          article_id?: string
          chunk_index?: number
          chunk_text?: string
          created_at?: string | null
          embedding?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "article_embeddings_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "scientific_articles"
            referencedColumns: ["id"]
          },
        ]
      }
      child_access: {
        Row: {
          child_id: string
          created_at: string | null
          id: string
          user_id: string
        }
        Insert: {
          child_id: string
          created_at?: string | null
          id?: string
          user_id: string
        }
        Update: {
          child_id?: string
          created_at?: string | null
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "child_access_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
        ]
      }
      children: {
        Row: {
          avatar_path: string | null
          birth_month: number | null
          birth_year: number | null
          created_at: string | null
          id: string
          insights: string | null
          name: string
          parent_id: string
          rolling_summary: string | null
          theme_color: string | null
          updated_at: string | null
        }
        Insert: {
          avatar_path?: string | null
          birth_month?: number | null
          birth_year?: number | null
          created_at?: string | null
          id?: string
          insights?: string | null
          name: string
          parent_id: string
          rolling_summary?: string | null
          theme_color?: string | null
          updated_at?: string | null
        }
        Update: {
          avatar_path?: string | null
          birth_month?: number | null
          birth_year?: number | null
          created_at?: string | null
          id?: string
          insights?: string | null
          name?: string
          parent_id?: string
          rolling_summary?: string | null
          theme_color?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      insight_jobs: {
        Row: {
          child_id: string
          completed_at: string | null
          created_at: string | null
          error_message: string | null
          id: string
          job_type: string
          meltdown_id: string | null
          started_at: string | null
          status: string
        }
        Insert: {
          child_id: string
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          job_type: string
          meltdown_id?: string | null
          started_at?: string | null
          status?: string
        }
        Update: {
          child_id?: string
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          job_type?: string
          meltdown_id?: string | null
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "insight_jobs_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insight_jobs_meltdown_id_fkey"
            columns: ["meltdown_id"]
            isOneToOne: false
            referencedRelation: "meltdowns"
            referencedColumns: ["id"]
          },
        ]
      }
      meltdown_embeddings: {
        Row: {
          created_at: string | null
          embedding: string | null
          id: string
          meltdown_id: string
          summary_text: string | null
        }
        Insert: {
          created_at?: string | null
          embedding?: string | null
          id?: string
          meltdown_id: string
          summary_text?: string | null
        }
        Update: {
          created_at?: string | null
          embedding?: string | null
          id?: string
          meltdown_id?: string
          summary_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meltdown_embeddings_meltdown_id_fkey"
            columns: ["meltdown_id"]
            isOneToOne: true
            referencedRelation: "meltdowns"
            referencedColumns: ["id"]
          },
        ]
      }
      meltdowns: {
        Row: {
          child_id: string
          child_state: string[] | null
          confidence_level: number | null
          created_at: string | null
          description: string | null
          duration: string | null
          environment_description: string | null
          environment_factors: string[] | null
          environment_trigger: string | null
          id: string
          location: string | null
          meltdown_level: number
          noise_level: string | null
          photos: string[] | null
          preceding_activities: string[] | null
          resolution_strategies: string[] | null
          timestamp: string | null
          updated_at: string | null
        }
        Insert: {
          child_id: string
          child_state?: string[] | null
          confidence_level?: number | null
          created_at?: string | null
          description?: string | null
          duration?: string | null
          environment_description?: string | null
          environment_factors?: string[] | null
          environment_trigger?: string | null
          id?: string
          location?: string | null
          meltdown_level: number
          noise_level?: string | null
          photos?: string[] | null
          preceding_activities?: string[] | null
          resolution_strategies?: string[] | null
          timestamp?: string | null
          updated_at?: string | null
        }
        Update: {
          child_id?: string
          child_state?: string[] | null
          confidence_level?: number | null
          created_at?: string | null
          description?: string | null
          duration?: string | null
          environment_description?: string | null
          environment_factors?: string[] | null
          environment_trigger?: string | null
          id?: string
          location?: string | null
          meltdown_level?: number
          noise_level?: string | null
          photos?: string[] | null
          preceding_activities?: string[] | null
          resolution_strategies?: string[] | null
          timestamp?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meltdowns_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
        ]
      }
      scientific_articles: {
        Row: {
          chunk_count: number | null
          created_at: string | null
          error_message: string | null
          file_path: string
          filename: string
          id: string
          status: string
          title: string
          updated_at: string | null
          uploaded_by: string
        }
        Insert: {
          chunk_count?: number | null
          created_at?: string | null
          error_message?: string | null
          file_path: string
          filename: string
          id?: string
          status?: string
          title: string
          updated_at?: string | null
          uploaded_by: string
        }
        Update: {
          chunk_count?: number | null
          created_at?: string | null
          error_message?: string | null
          file_path?: string
          filename?: string
          id?: string
          status?: string
          title?: string
          updated_at?: string | null
          uploaded_by?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      users_extended: {
        Row: {
          auth_user_id: string
          created_at: string | null
          first_name: string
          last_name: string
        }
        Insert: {
          auth_user_id: string
          created_at?: string | null
          first_name: string
          last_name: string
        }
        Update: {
          auth_user_id?: string
          created_at?: string | null
          first_name?: string
          last_name?: string
        }
        Relationships: []
      }
      waitlist: {
        Row: {
          created_at: string
          email: string
          id: string
          user_type: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          user_type: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          user_type?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_email_by_id: { Args: { _user_id: string }; Returns: string }
      get_user_id_by_email: { Args: { _email: string }; Returns: string }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      search_article_embeddings: {
        Args: { match_count?: number; query_embedding: string }
        Returns: {
          article_id: string
          chunk_index: number
          chunk_text: string
          id: string
          similarity: number
        }[]
      }
      user_has_child_access: {
        Args: { _child_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "Parent" | "Teacher" | "Clinician" | "Admin"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      app_role: ["Parent", "Teacher", "Clinician", "Admin"],
    },
  },
} as const
