import os
import psycopg2
from psycopg2.extras import RealDictCursor
from contextlib import contextmanager
from dotenv import load_dotenv
from typing import Optional, Dict, Any, Iterator, List
import logging


load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class Database:
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._init_db()
        return cls._instance
    
    def _init_db(self):
        try:
            self.conn = psycopg2.connect(
                dbname=os.getenv("DB_NAME"),
                user=os.getenv("DB_USER"),
                password=os.getenv("DB_PASSWORD"),
                host=os.getenv("DB_HOST"),
                port=os.getenv("DB_PORT"),
                cursor_factory=RealDictCursor
            )
            self.conn.autocommit = False
            logger.info("Database connection established")
        except Exception as e:
            logger.error(f"Database connection failed: {e}")
            raise
    
    @contextmanager
    def get_cursor(self) -> Iterator[RealDictCursor]:
        cursor = self.conn.cursor()
        try:
            yield cursor
            self.conn.commit()
        except Exception as e:
            self.conn.rollback()
            logger.error(f"Database operation failed: {e}")
            raise
        finally:
            cursor.close()
    
    def close(self):
        if self.conn and not self.conn.closed:
            self.conn.close()
            self._instance = None
            logger.info("Database connection closed")

# Singleton database instance
db = Database()

def get_user_by_username(username: str) -> Optional[Dict[str, Any]]:
    try:
        with db.get_cursor() as cursor:
            cursor.execute("""
                SELECT id, username, email, hashed_password, is_active, is_superuser,
                       subscription_active, subscription_id, subscription_plan, 
                       monthly_character_limit, characters_used, created_at
                FROM users 
                WHERE username = %s
                """, (username,))
            return cursor.fetchone()
    except Exception as e:
        logger.error(f"Error fetching user by username: {e}")
        return None

def create_user(username: str, email: str, hashed_password: str) -> Optional[int]:
    try:
        with db.get_cursor() as cursor:
            cursor.execute("""
                INSERT INTO users (username, email, hashed_password)
                VALUES (%s, %s, %s)
                RETURNING id
                """, (username, email, hashed_password))
            return cursor.fetchone()['id']
    except psycopg2.IntegrityError as e:
        logger.error(f"User creation failed (duplicate): {e}")
        return None
    except Exception as e:
        logger.error(f"User creation failed: {e}")
        return None

def update_user_subscription(
    username: str, 
    subscription_id: str, 
    plan_id: str, 
    active: bool
) -> bool:
    try:
        with db.get_cursor() as cursor:
            cursor.execute("""
                UPDATE users 
                SET subscription_active = %s, 
                    subscription_id = %s,
                    subscription_plan = %s,
                    monthly_character_limit = CASE 
                        WHEN %s = 'basic' THEN 50000
                        WHEN %s = 'pro' THEN 200000
                        WHEN %s = 'enterprise' THEN 1000000
                        ELSE 50000
                    END
                WHERE username = %s
                RETURNING id
                """, (active, subscription_id, plan_id, plan_id, plan_id, plan_id, username))
            return cursor.fetchone() is not None
    except Exception as e:
        logger.error(f"Subscription update failed: {e}")
        return False

def create_subscription_record(
    user_id: int, 
    stripe_subscription_id: str,
    stripe_customer_id: str,
    plan_id: str,
    status: str = 'active'
) -> bool:
    try:
        with db.get_cursor() as cursor:
            cursor.execute("""
                INSERT INTO subscriptions (
                    user_id, stripe_subscription_id, stripe_customer_id,
                    plan_id, status, current_period_start, current_period_end
                )
                VALUES (%s, %s, %s, %s, %s, NOW(), NOW() + INTERVAL '1 month')
                RETURNING id
                """, (user_id, stripe_subscription_id, stripe_customer_id, plan_id, status))
            return cursor.fetchone() is not None
    except Exception as e:
        logger.error(f"Subscription record creation failed: {e}")
        return False

def record_translation(
    user_id: int,
    source_text: str,
    translated_text: str,
    source_lang: str,
    target_lang: str,
    character_count: int,
    document_type: Optional[str] = None,
    file_name: Optional[str] = None,
    session_id: Optional[str] = None,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None
) -> bool:
    try:
        with db.get_cursor() as cursor:
            # Record translation history
            cursor.execute("""
                INSERT INTO translation_history (
                    user_id, session_id, source_text, translated_text,
                    source_language, target_language, character_count,
                    document_type, file_name, ip_address, user_agent
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """, (
                    user_id, session_id, source_text, translated_text,
                    source_lang, target_lang, character_count,
                    document_type, file_name, ip_address, user_agent
                ))
            
            # Update user's character count
            cursor.execute("""
                UPDATE users
                SET characters_used = characters_used + %s
                WHERE id = %s
                """, (character_count, user_id))
            
            return True
    except Exception as e:
        logger.error(f"Translation recording failed: {e}")
        return False

def get_user_translation_history(
    user_id: int, 
    limit: int = 10, 
    offset: int = 0
) -> List[Dict[str, Any]]:
    try:
        with db.get_cursor() as cursor:
            cursor.execute("""
                SELECT id, session_id, source_language, target_language,
                       character_count, document_type, file_name, created_at
                FROM translation_history
                WHERE user_id = %s
                ORDER BY created_at DESC
                LIMIT %s OFFSET %s
                """, (user_id, limit, offset))
            return cursor.fetchall()
    except Exception as e:
        logger.error(f"Failed to fetch translation history: {e}")
        return []

def get_user_usage_stats(user_id: int) -> Dict[str, Any]:
    try:
        with db.get_cursor() as cursor:
            # Get current month usage
            cursor.execute("""
                SELECT COALESCE(SUM(character_count), 0) as monthly_usage
                FROM translation_history
                WHERE user_id = %s 
                AND created_at >= date_trunc('month', CURRENT_DATE)
                """, (user_id,))
            monthly_usage = cursor.fetchone()['monthly_usage']
            
            # Get user's limit
            cursor.execute("""
                SELECT monthly_character_limit, characters_used
                FROM users
                WHERE id = %s
                """, (user_id,))
            limit_info = cursor.fetchone()
            
            return {
                'monthly_usage': monthly_usage,
                'monthly_limit': limit_info['monthly_character_limit'],
                'total_usage': limit_info['characters_used'],
                'remaining': limit_info['monthly_character_limit'] - monthly_usage
            }
    except Exception as e:
        logger.error(f"Failed to fetch usage stats: {e}")
        return {
            'monthly_usage': 0,
            'monthly_limit': 0,
            'total_usage': 0,
            'remaining': 0
        }