import axios from 'axios';

const API_BASE_URL = 'http://localhost:8000';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 300000, // 5 minutes timeout
});

// Add a request interceptor to include the token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

// Add a response interceptor to handle 401 errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const checkCharacterLimit = async (textLength) => {
  try {
    const response = await api.get('/api/users/me');
    const { monthly_character_limit, characters_used } = response.data;
    const remaining = monthly_character_limit - characters_used;
    
    if (textLength > remaining) {
      throw new Error(`Exceeds monthly limit. ${remaining} characters remaining.`);
    }
    
    return remaining - textLength;
  } catch (error) {
    console.error('Character limit check failed:', error);
    throw error;
  }
};

export const createSubscription = async (priceId) => {
  try {
    const response = await api.post(
      '/api/create-subscription',
      { price_id: priceId },  // Ensure snake_case to match backend
      {
        headers: {
          'Content-Type': 'application/json',
        }
      }
    );
    return response.data;
  } catch (error) {
    console.error('Subscription error details:', {
      message: error.message,
      response: error.response?.data,
      request: error.config?.data
    });
    throw error;
  }
};

export const getUser = async () => {
  try {
    const response = await api.get('/api/users/me');
    return response.data;
  } catch (error) {
    throw error;
  }
};

export const login = async (username, password) => {
  try {
    const response = await api.post('/api/token', {
      username,
      password
    }, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    return response.data;
  } catch (error) {
    console.error('Login error:', error);
    throw error;
  }
};

export const register = async (username, email, password) => {
  try {
    const response = await api.post('/api/register', { username, email, password });
    return response.data;
  } catch (error) {
    console.error('Registration error:', error);
    throw error;
  }
};

export const getTranslationHistory = async (limit = 10, offset = 0) => {
  try {
    const response = await api.get('/api/users/history', {
      params: { limit, offset }
    });
    return response.data;
  } catch (error) {
    console.error('History fetch error:', error);
    throw error;
  }
};

export const translateText = async (text, sourceLang, targetLang, onProgress) => {
  try {
    // Check character limit first
    await checkCharacterLimit(text.length);
    
    // For small texts (<1000 chars), use direct translation
    if (text.length <= 1000) {
      const response = await api.post('/api/translate-text', {
        text,
        source: sourceLang,
        target: targetLang
      });
      return response.data;
    }

    // For large texts, use chunked translation with progress
    const chunkSize = 1500; // Optimal chunk size
    const chunks = [];
    
    // Split text into chunks preserving sentence boundaries
    let currentChunk = '';
    const sentences = text.split(/(?<!\w\.\w.)(?<![A-Z][a-z]\.)(?<=\.|\?|\!)\s/g);
    
    for (const sentence of sentences) {
      if (currentChunk.length + sentence.length > chunkSize && currentChunk) {
        chunks.push(currentChunk);
        currentChunk = sentence;
      } else {
        currentChunk += (currentChunk ? ' ' : '') + sentence;
      }
      
      // Update progress
      if (onProgress) {
        const progress = Math.min(
          99, 
          Math.floor(((currentChunk.length + chunks.join(' ').length) / text.length) * 100)
        );
        onProgress(progress);
      }
    }
    
    if (currentChunk) {
      chunks.push(currentChunk);
    }

    // Translate chunks sequentially to avoid rate limiting
    let translatedText = '';
    for (let i = 0; i < chunks.length; i++) {
      const response = await api.post('/api/translate-text', {
        text: chunks[i],
        source: sourceLang,
        target: targetLang
      });
      
      translatedText += (translatedText ? ' ' : '') + response.data.translatedText;
      
      // Update progress
      if (onProgress) {
        const progress = Math.min(
          99, 
          Math.floor(((i + 1) / chunks.length) * 100)
        );
        onProgress(progress);
      }
      
      // Small delay between chunks
      if (i < chunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }

    if (onProgress) onProgress(100);
    
    return {
      translatedText: translatedText,
      sourceLang,
      targetLang,
      charactersTranslated: text.length
    };
  } catch (error) {
    if (error.message.includes('Exceeds monthly limit')) {
      throw new Error(error.message + ' Please upgrade your plan.');
    }
    console.error('Translation error:', error);
    throw error;
  }
};

export const translateFile = async (file, sourceLang, targetLang, onProgress) => {
  try {
    // First estimate the file size (1 char ≈ 1 byte for plain text)
    let charCount = file.size;
    
    // For document files, we'll need to extract text to get accurate count
    if (file.type !== 'text/plain') {
      // This is a rough estimate - actual count will be determined during processing
      charCount = file.size * 0.5; // Adjust factor based on your typical documents
    }
    
    await checkCharacterLimit(charCount);
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('source_lang', sourceLang);
    formData.append('target_lang', targetLang);

    const response = await api.post('/api/translate', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      },
      responseType: 'blob',
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const percentComplete = Math.round((progressEvent.loaded / progressEvent.total) * 50);
          onProgress(percentComplete);
        }
      },
      onDownloadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const percentComplete = 50 + Math.round((progressEvent.loaded / progressEvent.total) * 50);
          onProgress(percentComplete);
        }
      }
    });

    return response;
  } catch (error) {
    console.error('File translation error:', error);
    throw error;
  }
};


