import sys
import psycopg2

db_url = sys.argv[1]
conn = psycopg2.connect(db_url)
cur = conn.cursor()
# We need to simulate the user logging in. is_admin() checks auth.uid()
# auth.uid() only works if we set the request.jwt.claims
# We can just verify the RPC exists and is executable by authenticated
cur.execute("SELECT has_function_privilege('authenticated', 'is_admin()', 'execute');")
print(f"is_admin executable by authenticated: {cur.fetchone()[0]}")
