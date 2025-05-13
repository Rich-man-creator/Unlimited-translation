import os
from database import db
from psycopg2 import sql

def run_migrations():
    with db.get_cursor() as cursor:
        # Read migration file
        with open('migrations/001_initial_schema.sql', 'r') as f:
            migration_sql = f.read()
        
        # Execute migration in a transaction
        cursor.execute(migration_sql)
        print("Database schema initialized successfully")

if __name__ == '__main__':
    run_migrations()