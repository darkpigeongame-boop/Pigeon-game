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
      secret_messages: {
        Row: {
          created_at: string
          deleted: boolean
          file_name: string | null
          file_size: number | null
          file_url: string | null
          id: string
          kind: string
          sender: string
          text: string | null
        }
        Insert: {
          created_at?: string
          deleted?: boolean
          file_name?: string | null
          file_size?: number | null
          file_url?: string | null
          id?: string
          kind?: string
          sender: string
          text?: string | null
        }
        Update: {
          created_at?: string
          deleted?: boolean
          file_name?: string | null
          file_size?: number | null
          file_url?: string | null
          id?: string
          kind?: string
          sender?: string
          text?: string | null
        }
      }
    }
  }
}
