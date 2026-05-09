import { createClient } from '@supabase/supabase-js';

// Hardcoded for production stability to bypass environment variable loading issues in some browsers
const supabaseUrl = "https://otofpzsdyfxmqvigklnb.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im90b2ZwenNkeWZ4bXF2aWdrbG5iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5NzA2MTEsImV4cCI6MjA5MzU0NjYxMX0.8Ym6wBMYNLwH_Fj-I6CJBrH70X06eRMzU_p9uWhjoVk";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
