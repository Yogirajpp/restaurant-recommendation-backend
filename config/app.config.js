// config/app.config.js
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const appConfig = {
  // Server configuration
  server: {
    port: process.env.PORT || 5000,
    env: process.env.NODE_ENV,
  },
  
  // Database configuration
  db: {
    uri: process.env.MONGODB_URI ,
  },
  
  // Hugging Face configuration
  huggingface: {
    apiKey: process.env.HUGGINGFACE_API_KEY,
    models: {
      gptModel: process.env.GPTJ_MODEL_ID || 'EleutherAI/gpt-neo-1.3B',
    //   gptModel: process.env.GPTJ_MODEL_ID || 'EleutherAI/gpt-j-6B',
    },
  },
  
  // Google API configuration
  google: {
    maps: {
      apiKey: process.env.GOOGLE_MAPS_API_KEY,
    },
    places: {
      apiKey: process.env.GOOGLE_PLACES_API_KEY,
    },
  },
};

export default appConfig;