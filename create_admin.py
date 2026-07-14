import sys
import psycopg2

db_url = sys.argv[1]
conn = psycopg2.connect(db_url)
cur = conn.cursor()
cur.execute("""
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, 
  last_sign_in_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000000', 
  gen_random_uuid(), 
  'authenticated', 
  'authenticated', 
  'admin@relogo.app', 
  crypt('password123', gen_salt('bf')), 
  now(), 
  now(), 
  '{"provider":"email","providers":["email"]}', 
  '{}', 
  now(), 
  now()
) ON CONFLICT DO NOTHING;
""")
conn.commit()

cur.execute("SELECT email, created_at FROM public.admin_users WHERE email = 'admin@relogo.app';")
print(f"Admin found: {cur.fetchall()}")
