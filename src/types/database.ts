export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      children: {
        Row: {
          id: string
          parent_id: string
          name: string
          birth_month: number | null
          birth_year: number | null
          created_at: string
          updated_at: string
          rolling_summary: string | null
          insights: string | null
        }
        Insert: {
          id?: string
          parent_id: string
          name: string
          birth_month: number
          birth_year: number
          created_at?: string
          updated_at?: string
          rolling_summary?: string | null
          insights?: string | null
        }
        Update: {
          id?: string
          parent_id?: string
          name?: string
          birth_month?: number | null
          birth_year?: number | null
          created_at?: string
          updated_at?: string
          rolling_summary?: string | null
          insights?: string | null
        }
      }
      child_access: {
        Row: {
          id: string
          child_id: string
          user_id: string
          created_at: string
        }
        Insert: {
          id?: string
          child_id: string
          user_id: string
          created_at?: string
        }
        Update: {
          id?: string
          child_id?: string
          user_id?: string
          created_at?: string
        }
      }
      meltdowns: {
        Row: {
          id: string
          child_id: string
          timestamp: string
          environment_trigger: string | null
          noise_level: string | null
          environment_description: string | null
          meltdown_level: number
          description: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          child_id: string
          timestamp?: string
          environment_trigger?: string | null
          noise_level?: string | null
          environment_description?: string | null
          meltdown_level: number
          description?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          child_id?: string
          timestamp?: string
          environment_trigger?: string | null
          noise_level?: string | null
          environment_description?: string | null
          meltdown_level?: number
          description?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      users_extended: {
        Row: {
          auth_user_id: string
          first_name: string
          last_name: string
          created_at: string
        }
        Insert: {
          auth_user_id: string
          first_name: string
          last_name: string
          created_at?: string
        }
        Update: {
          auth_user_id?: string
          first_name?: string
          last_name?: string
          created_at?: string
        }
      }
      user_roles: {
        Row: {
          id: string
          user_id: string
          role: 'Parent' | 'Teacher' | 'Clinician' | 'Admin'
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          role: 'Parent' | 'Teacher' | 'Clinician' | 'Admin'
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          role?: 'Parent' | 'Teacher' | 'Clinician' | 'Admin'
          created_at?: string
        }
      }
    }
  }
}
