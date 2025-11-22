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
          age: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          parent_id: string
          name: string
          age: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          parent_id?: string
          name?: string
          age?: number
          created_at?: string
          updated_at?: string
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
          role: 'Parent' | 'Teacher' | 'Clinician'
        }
        Insert: {
          auth_user_id: string
          first_name: string
          last_name: string
          role: 'Parent' | 'Teacher' | 'Clinician'
        }
        Update: {
          auth_user_id?: string
          first_name?: string
          last_name?: string
          role?: 'Parent' | 'Teacher' | 'Clinician'
        }
      }
    }
  }
}
