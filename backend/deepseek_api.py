import os
import requests
import time
from typing import Optional, Generator, List, Tuple
from concurrent.futures import ThreadPoolExecutor, as_completed
import logging
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class TranslationError(Exception):
    pass

class AuthenticationError(TranslationError):
    pass

class RateLimitError(TranslationError):
    pass

class DeepSeekTranslator:
    """
    Enhanced DeepSeek translation client with:
    - Better chunking
    - Rate limiting
    - Improved error handling
    - Progress tracking
    """
    
    def __init__(self, api_key: Optional[str] = None, base_url: Optional[str] = None):
        self.api_key = api_key or os.getenv("DEEPSEEK_API_KEY")
        if not self.api_key:
            raise ValueError("DeepSeek API key is required")
        
        self.base_url = base_url or "https://api.deepseek.com/chat/completions"
        self.timeout = 30
        self.max_retries = 3
        self.session = requests.Session()
        self.last_request_time = 0
        self.min_request_interval = 0.2  # 200ms between requests to avoid rate limiting
        self.max_chunk_size = 1000  # Configurable
        self.min_chunk_size = 200   # Don't go below this

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=4, max=10),
        retry=retry_if_exception_type((requests.exceptions.RequestException, RateLimitError)))
    def translate_text(
        self,
        text: str,
        target_lang: str,
        source_lang: str = "auto",
        **kwargs
    ) -> str:
        """
        Direct text translation with rate limiting and retries
        """
        # Rate limiting
        elapsed = time.time() - self.last_request_time
        if elapsed < self.min_request_interval:
            time.sleep(self.min_request_interval - elapsed)
        
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json"
        }

        prompt = (
            f"Translate the following text from {source_lang} to {target_lang}.\n"
            f"Preserve formatting, special characters, and proper nouns.\n"
            f"Text: {text}"
        )
        
        payload = {
            "model": "deepseek-chat",
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.3,
            **kwargs
        }

        try:
            self.last_request_time = time.time()
            response = self.session.post(
                self.base_url,
                headers=headers,
                json=payload,
                timeout=(3.05, 30)  # Connect timeout, read timeout
            )

            if response.status_code == 429:
                raise RateLimitError("Rate limit exceeded")
            if response.status_code == 401:
                raise AuthenticationError("Invalid API key")
            response.raise_for_status()
            
            return self._parse_response(response.json())
        except requests.exceptions.Timeout:
                if len(text) > self.min_chunk_size:
                    new_size = max(self.min_chunk_size, len(text)//2)
                    logger.warning(f"Reducing chunk size to {new_size} and retrying")
                    return self._translate_in_parts(text, new_size, target_lang, source_lang)
                raise

    def translate_large_text(
        self,
        text: str,
        target_lang: str,
        source_lang: str = "auto",
        chunk_size: int = 1000,  # Reduced chunk size for reliability
        max_workers: int = 2,    # Reduced parallelism to avoid rate limiting
        progress_callback: callable = None,
        **kwargs
    ) -> str:
        """
        Translate large text with:
        - Smart chunking
        - Progress reporting
        - Error recovery
        """
        chunks = list(self._split_text_into_chunks(text, chunk_size))
        total_chunks = len(chunks)
        results: List[Tuple[int, str]] = []
        completed = 0
        errors = 0
        
        def update_progress():
            if progress_callback:
                # Calculate progress based on completed chunks
                progress = min(100, int((completed / total_chunks) * 100))
                progress_callback(progress)

        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = {
                executor.submit(
                    self._safe_translate_chunk,
                    chunk,
                    chunk_num,
                    target_lang,
                    source_lang,
                    **kwargs
                ): chunk_num
                for chunk_num, chunk in enumerate(chunks)
            }
            
            for future in as_completed(futures):
                chunk_num = futures[future]
                try:
                    result = future.result()
                    if result is not None:  # Skip failed chunks
                        results.append((chunk_num, result))
                    completed += 1
                    update_progress()
                except Exception as e:
                    logger.error(f"Chunk {chunk_num} failed: {str(e)}")
                    errors += 1
                    # Add placeholder for failed chunk
                    results.append((chunk_num, f"[TRANSLATION ERROR: {str(e)}]"))
                    completed += 1
                    update_progress()

        # Final progress update
        if progress_callback:
            progress_callback(100)

        # Reconstruct text in original order
        results.sort(key=lambda x: x[0])
        translated_text = " ".join([chunk for _, chunk in results])
        
        if errors > 0:
            logger.warning(f"Translation completed with {errors} errors")
            
        return translated_text

    def _safe_translate_chunk(
        self,
        chunk: str,
        chunk_num: int,
        target_lang: str,
        source_lang: str,
        **kwargs
    ) -> Optional[str]:
        """
        Safely translate a single chunk with error handling
        """
        try:
            return self.translate_text(
                chunk,
                target_lang,
                source_lang,
                **kwargs
            )
        except Exception as e:
            logger.error(f"Failed to translate chunk {chunk_num}: {str(e)}")
            raise  # Re-raise to handle in the caller

    def _split_text_into_chunks(self, text: str, chunk_size: int) -> Generator[str, None, None]:
        """
        Smart text chunking that preserves:
        - Paragraph boundaries
        - Sentence boundaries when possible
        - Natural language breaks
        """
        if len(text) <= chunk_size:
            yield text
            return

        # First try to split by paragraphs
        paragraphs = text.split('\n\n')
        current_chunk = ""
        
        for para in paragraphs:
            if len(current_chunk) + len(para) > chunk_size:
                if current_chunk:
                    yield current_chunk
                    current_chunk = para
                else:
                    # Paragraph is too big, split by sentences
                    sentences = para.split('. ')
                    for sent in sentences:
                        if len(current_chunk) + len(sent) > chunk_size:
                            if current_chunk:
                                yield current_chunk
                                current_chunk = sent
                            else:
                                # Sentence is too big, split by words
                                words = sent.split(' ')
                                for word in words:
                                    if len(current_chunk) + len(word) > chunk_size:
                                        if current_chunk:
                                            yield current_chunk
                                            current_chunk = word
                                        else:
                                            # Word is too big (unlikely), split by characters
                                            for i in range(0, len(word), chunk_size):
                                                yield word[i:i+chunk_size]
                                    else:
                                        current_chunk += ' ' + word if current_chunk else word
                        else:
                            current_chunk += '. ' + sent if current_chunk else sent
            else:
                current_chunk += '\n\n' + para if current_chunk else para
        
        if current_chunk:
            yield current_chunk

    def _parse_response(self, response_data: dict) -> str:
        """Extract translated text from API response."""
        try:
            if "choices" in response_data:
                content = response_data["choices"][0]["message"]["content"]
                # Clean up any extra instructions from the response
                if "Translation:" in content:
                    content = content.split("Translation:", 1)[1].strip()
                return content
            raise TranslationError("Unexpected API response format")
        except (KeyError, IndexError) as e:
            raise TranslationError(f"Malformed API response: {response_data}")