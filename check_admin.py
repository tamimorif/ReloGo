import sys
import psycopg2

db_url = sys.argv[1]
conn = psycopg2.connect(db_url)
cur = conn.cursor()
cur.execute("SELECT count(*) FROM public.admin_users;")
print(f"Admin count: {cur.fetchall()[0][0]}")
