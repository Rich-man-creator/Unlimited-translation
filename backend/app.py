import logging
import os
import time
from functools import wraps
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from dotenv import load_dotenv
from flask import Flask, request, jsonify, make_response, send_file
from pytz import InvalidTimeError
from werkzeug.utils import secure_filename
import tempfile
from deepseek_api import DeepSeekTranslator
from file_processor import FileProcessor
from flask_cors import CORS
from jose import ExpiredSignatureError, jwt, JWTError
from jose.constants import ALGORITHMS
from passlib.context import CryptContext
import stripe
from database import db

from database import (
    get_user_by_username,
    create_user,
    update_user_subscription,
    create_subscription_record,
    record_translation,
    get_user_translation_history,
    get_user_usage_stats
)

# Initialize Flask app
app = Flask(__name__)
CORS(app)

# Configuration
load_dotenv()
ALLOWED_EXTENSIONS = {'txt', 'pdf', 'docx', 'pptx', 'xlsx'}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB

# Authentication
SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-here")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30
pwd_context = CryptContext(schemes=["sha256_crypt"], deprecated="auto")

# Stripe
stripe.api_key = os.getenv("STRIPE_SECRET_KEY")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET")

# Initialize services
translator = DeepSeekTranslator(os.getenv("DEEPSEEK_API_KEY"))
file_processor = FileProcessor()

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Helper functions
def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def authenticate_user(username: str, password: str) -> Optional[Dict[str, Any]]:
    user = get_user_by_username(username)
    if not user:
        return None
    if not pwd_context.verify(password, user['hashed_password']):
        return None
    return user

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        if 'Authorization' in request.headers:
            token = request.headers['Authorization'].split(" ")[1]
        
        if not token:
            return jsonify({'message': 'Token is missing!'}), 401
            
        try:
            data = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            current_user = get_user_by_username(data['sub'])
            if not current_user:
                raise Exception("User not found")
        except ExpiredSignatureError:
            return jsonify({'message': 'Token has expired!'}), 401
        except InvalidTimeError:
            return jsonify({'message': 'Token is invalid!'}), 401
        except Exception as e:
            return jsonify({'message': str(e)}), 401

        return f(current_user, *args, **kwargs)
    return decorated

# Authentication endpoints
@app.route('/api/token', methods=['POST'])
def login_for_access_token():
    form_data = request.form
    username = form_data.get('username')
    password = form_data.get('password')
    
    user = authenticate_user(username, password)
    if not user:
        return jsonify({"error": "Incorrect username or password"}), 401
    
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        {"sub": user['username']},
        expires_delta=access_token_expires
    )
    
    # Remove sensitive data before returning
    user.pop('hashed_password', None)
    
    return jsonify({
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "username": user['username'],
            "email": user['email'],
            "subscription_active": user['subscription_active'],
            "subscription_plan": user['subscription_plan']
        }
    })

@app.route('/api/register', methods=['POST'])
def register():
    data = request.json
    username = data.get('username')
    email = data.get('email')
    password = data.get('password')
    
    if not username or not email or not password:
        return jsonify({"error": "Missing required fields"}), 400
    
    hashed_password = pwd_context.hash(password)
    user_id = create_user(username, email, hashed_password)
    
    if not user_id:
        return jsonify({"error": "Username or email already exists"}), 400
    
    # Automatically log in the user after registration
    user = get_user_by_username(username)
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        {"sub": user['username']},
        expires_delta=access_token_expires
    )
    
    user.pop('hashed_password', None)
    
    return jsonify({
        "access_token": access_token,
        "token_type": "bearer",
        "user": user
    })

@app.route('/api/users/me', methods=['GET'])
@token_required
def read_users_me(current_user):
    # Get updated usage stats
    usage_stats = get_user_usage_stats(current_user['id'])
    
    # Remove sensitive data before returning
    current_user.pop('hashed_password', None)
    
    return jsonify({
        **current_user,
        **usage_stats
    })

@app.route('/api/users/history', methods=['GET'])
@token_required
def get_user_history(current_user):
    limit = request.args.get('limit', default=10, type=int)
    offset = request.args.get('offset', default=0, type=int)
    
    history = get_user_translation_history(current_user['id'], limit, offset)
    return jsonify(history)

# Subscription endpoints
@app.route('/api/create-subscription', methods=['POST'])
@token_required
def create_subscription(current_user):
    data = request.get_json()
    price_id = data.get('price_id')
    
    try:
        session = stripe.checkout.Session.create(
            payment_method_types=['card'],
            line_items=[{
                'price': price_id,
                'quantity': 1,
            }],
            mode='subscription',
            success_url=f"{os.getenv('FRONTEND_URL')}/success?session_id={{CHECKOUT_SESSION_ID}}",  # Updated
            cancel_url=f"{os.getenv('FRONTEND_URL')}/plans",
            customer_email=current_user['email'],
            client_reference_id=current_user['username'],
            metadata={
                'user_id': current_user['id'],
                'plan_id': data.get('plan_id', 'basic')
            }
        )
        return jsonify({"sessionId": session.id})
    except stripe.error.StripeError as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/stripe-webhook', methods=['POST'])
def stripe_webhook():
    payload = request.data
    sig_header = request.headers.get('Stripe-Signature')
    event = None
    
    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, os.getenv('STRIPE_WEBHOOK_SECRET')
        )
    except ValueError as e:
        logger.error(f"Invalid payload: {e}")
        return jsonify({"error": "Invalid payload"}), 400
    except stripe.error.SignatureVerificationError as e:
        logger.error(f"Invalid signature: {e}")
        return jsonify({"error": "Invalid signature"}), 400
    
    # Handle the event
    event_type = event['type']
    logger.info(f"Processing Stripe event: {event_type}")
    
    try:
        if event_type == 'checkout.session.completed':
            handle_checkout_session(event['data']['object'])
        elif event_type == 'invoice.payment_succeeded':
            handle_payment_succeeded(event['data']['object'])
        elif event_type == 'customer.subscription.deleted':
            handle_subscription_deleted(event['data']['object'])
        elif event_type == 'customer.subscription.updated':
            handle_subscription_updated(event['data']['object'])
        else:
            logger.info(f"Unhandled event type: {event_type}")
            
        return jsonify({"status": "success"}), 200
        
    except Exception as e:
        logger.error(f"Error handling webhook: {str(e)}")
        return jsonify({"error": "Internal server error"}), 500
    

def handle_checkout_session(session):
    username = session['client_reference_id']
    subscription_id = session['subscription']
    customer_id = session['customer']
    
    try:
        # Get plan ID from metadata or default to 'basic'
        plan_id = session.get('metadata', {}).get('plan_id', 'basic')
        
        # Update user subscription status
        if not db.update_user_subscription(username, subscription_id, plan_id, True):
            logger.error(f"Failed to update subscription for user: {username}")
            return False
        
        # Get user ID
        user = db.get_user_by_username(username)
        if not user:
            logger.error(f"User not found: {username}")
            return False
        
        # Create subscription record
        if not db.create_subscription_record(
            user['id'],
            subscription_id,
            customer_id,
            plan_id
        ):
            logger.error(f"Failed to create subscription record for user: {username}")
            return False
        
        logger.info(f"Subscription successfully processed for {username}")
        return True
        
    except Exception as e:
        logger.error(f"Error in handle_checkout_session: {str(e)}")
        return False

def handle_payment_succeeded(invoice):
    subscription_id = invoice['subscription']
    try:
        subscription = stripe.Subscription.retrieve(subscription_id)
        with db.get_cursor() as cursor:
            cursor.execute("""
                UPDATE subscriptions
                SET current_period_start = to_timestamp(%s),
                    current_period_end = to_timestamp(%s),
                    updated_at = NOW()
                WHERE stripe_subscription_id = %s
                """, (
                    subscription.current_period_start,
                    subscription.current_period_end,
                    subscription_id
                ))
            return True
    except Exception as e:
        logger.error(f"Failed to update subscription period: {e}")
        return False

def handle_subscription_deleted(subscription):
    subscription_id = subscription['id']
    try:
        with db.get_cursor() as cursor:
            # Update subscription status
            cursor.execute("""
                UPDATE subscriptions
                SET status = 'canceled',
                    updated_at = NOW()
                WHERE stripe_subscription_id = %s
                """, (subscription_id,))
            
            # Update user's subscription status
            cursor.execute("""
                UPDATE users
                SET subscription_active = FALSE,
                    subscription_id = NULL,
                    subscription_plan = NULL,
                    monthly_character_limit = 50000
                WHERE subscription_id = %s
                """, (subscription_id,))
            
            return True
    except Exception as e:
        logger.error(f"Failed to cancel subscription: {e}")
        return False

def handle_subscription_updated(subscription):
    subscription_id = subscription['id']
    try:
        with db.get_cursor() as cursor:
            cursor.execute("""
                UPDATE subscriptions
                SET status = %s,
                    cancel_at_period_end = %s,
                    current_period_start = to_timestamp(%s),
                    current_period_end = to_timestamp(%s),
                    updated_at = NOW()
                WHERE stripe_subscription_id = %s
                """, (
                    subscription.status,
                    subscription.cancel_at_period_end,
                    subscription.current_period_start,
                    subscription.current_period_end,
                    subscription_id
                ))
            return True
    except Exception as e:
        logger.error(f"Failed to update subscription: {e}")
        return False

# Translation endpoints
@app.route('/api/translate', methods=['POST'])
@token_required
def translate_document(current_user):
    if 'file' not in request.files:
        logger.error("No file uploaded")
        return jsonify({'error': 'No file uploaded'}), 400

    file = request.files['file']
    target_lang = request.form.get('target_lang', 'en')
    source_lang = request.form.get('source_lang', 'auto')

    # Validate file
    if file.filename == '':
        logger.error("No selected file")
        return jsonify({'error': 'No selected file'}), 400

    if not allowed_file(file.filename):
        logger.error(f"Invalid file type: {file.filename}")
        return jsonify({'error': 'File type not allowed'}), 400

    temp_dir = tempfile.mkdtemp()
    try:
        # Save original file
        original_filename = secure_filename(file.filename)
        original_path = os.path.join(temp_dir, original_filename)
        file.save(original_path)
        logger.info(f"Saved uploaded file to {original_path}")

        # Process file in chunks with progress
        try:
            translated_chunks = []
            total_size = os.path.getsize(original_path)
            processed_size = 0
            
            for chunk in file_processor.extract_large_text(original_path):
                chunk_size = len(chunk.encode('utf-8'))
                processed_size += chunk_size
                
                translated = translator.translate_large_text(
                    text=chunk,
                    target_lang=target_lang,
                    source_lang=source_lang
                )
                translated_chunks.append(translated)
            
            translated_text = " ".join(translated_chunks)
            if not translated_text.strip():
                raise ValueError("Translation returned empty result")
        except Exception as e:
            logger.error(f"Translation failed: {str(e)}")
            return jsonify({'error': f"Translation failed: {str(e)}"}), 500

        # Reconstruct document
        try:
            translated_path = file_processor.reconstruct_document(
                original_path=original_path,
                translated_text=translated_text,
                target_lang=target_lang
            )
            logger.info(f"Document reconstructed at {translated_path}")
        except Exception as e:
            logger.error(f"Document reconstruction failed: {str(e)}")
            return jsonify({'error': str(e)}), 500

        # Record the translation
        record_translation(
            user_id=current_user['id'],
            source_text=f"File: {original_filename}",
            translated_text=f"Translated file: {original_filename}",
            source_lang=source_lang,
            target_lang=target_lang,
            character_count=processed_size,
            document_type=original_filename.split('.')[-1],
            file_name=original_filename,
            session_id=request.headers.get('X-Session-ID'),
            ip_address=request.remote_addr,
            user_agent=request.headers.get('User-Agent')
        )

        # Return the translated file
        response = make_response(send_file(
            translated_path,
            as_attachment=True,
            download_name=f"translated_{original_filename}"
        ))
        
        # Clean up files after sending
        @response.call_on_close
        def cleanup():
            try:
                for f in os.listdir(temp_dir):
                    os.remove(os.path.join(temp_dir, f))
                os.rmdir(temp_dir)
                logger.info(f"Cleaned up temp directory: {temp_dir}")
            except Exception as e:
                logger.error(f"Cleanup error: {str(e)}")

        return response

    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}")
        return jsonify({'error': str(e)}), 500
    
@app.route('/api/translate-text', methods=['POST'])
@token_required
def translate_text(current_user):
    """Enhanced text translation endpoint with chunking support"""
    data = request.get_json()
    
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    
    text = data.get('text')
    target_lang = data.get('target', 'en')
    source_lang = data.get('source', 'auto')

    if not text:
        return jsonify({'error': 'No text to translate'}), 400

    try:
        start_time = time.time()
        
        # Determine if we need chunked translation
        if len(text) > 1000:
            # Use chunked translation for large texts
            translated_text = translator.translate_large_text(
                text=text,
                target_lang=target_lang,
                source_lang=source_lang,
                chunk_size=1500,  # Optimal chunk size
                max_workers=2,     # Conservative parallelism
                progress_callback=None
            )
        else:
            # Direct translation for small texts
            translated_text = translator.translate_text(
                text=text,
                target_lang=target_lang,
                source_lang=source_lang
            )
            
        duration = time.time() - start_time
        logger.info(f"Translated {len(text)} chars in {duration:.2f}s")
        
        # Record the translation
        record_translation(
            user_id=current_user['id'],
            source_text=text[:500] + ("..." if len(text) > 500 else ""),
            translated_text=translated_text[:500] + ("..." if len(translated_text) > 500 else ""),
            source_lang=source_lang,
            target_lang=target_lang,
            character_count=len(text),
            session_id=request.headers.get('X-Session-ID'),
            ip_address=request.remote_addr,
            user_agent=request.headers.get('User-Agent')
        )
        
        # Get updated usage stats
        usage_stats = get_user_usage_stats(current_user['id'])
            
        return jsonify({
            'translatedText': translated_text,
            'sourceLang': source_lang,
            'targetLang': target_lang,
            'charactersTranslated': len(text),
            'usage': usage_stats
        })
    except Exception as e:
        logger.error(f"Translation error: {str(e)}")
        return jsonify({'error': str(e)}), 500
        

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8000, debug=False)