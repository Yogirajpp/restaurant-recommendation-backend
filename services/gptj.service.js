// services/gptj.service.js
import axios from 'axios';
import appConfig from '../config/app.config.js';
import logger from '../utils/logger.js';

/**
 * GPT Service for place recommendations
 * Uses Hugging Face's API to access language models
 */
class GptService {
  constructor() {
    this.apiUrl = 'https://api-inference.huggingface.co/models/';
    
    // Use a model that's suitable for text completion
    // For better results, consider using OpenAI's API instead
    this.modelId = appConfig.huggingface.models.gptModel || 'EleutherAI/gpt-neo-1.3B';
    
    this.headers = {
      'Authorization': `Bearer ${appConfig.huggingface.apiKey}`,
      'Content-Type': 'application/json'
    };
  }

  /**
   * Generate place recommendations using language model
   * @param {Object} params - Parameters for recommendation
   * @param {string} params.location - Location (e.g., "MG Road, Bangalore"), can be null
   * @param {string} params.prompt - User prompt (e.g., "romantic cafes", "hiking trails")
   * @param {Array} params.nearbyPlaces - List of nearby places (optional)
   * @returns {Promise<Object>} - Generated recommendations
   */
  async generatePlaceRecommendations(params) {
    try {
      const { location, prompt, nearbyPlaces = [] } = params;
      
      // Craft prompt for the model with examples to help it understand the format
      const promptText = this.createPlaceRecommendationPrompt(location, prompt, nearbyPlaces);
      
      // Call API
      const response = await this.callHuggingFaceAPI(promptText);
      
      if (!response.success) {
        return {
          success: false,
          message: 'Failed to generate recommendations',
          error: response.error
        };
      }
      
      // Process the response
      const processedResponse = this.processModelResponse(response.data, prompt, location);
      
      return {
        success: true,
        recommendations: processedResponse,
        rawResponse: process.env.NODE_ENV === 'development' ? response.data : undefined
      };
    } catch (error) {
      logger.error(`Error generating recommendations: ${error.message}`);
      return {
        success: false,
        message: 'Failed to generate recommendations',
        error: error.message
      };
    }
  }

  /**
   * Create a prompt for the language model with examples to guide the format
   * @param {string|null} location - Location for the search (can be null)
   * @param {string} prompt - User's prompt
   * @param {Array} nearbyPlaces - List of nearby places (optional)
   * @returns {string} - Formatted prompt
   */
  createPlaceRecommendationPrompt(location, prompt, nearbyPlaces = []) {
    // Add information about nearby places if available
    let nearbyInfo = '';
    if (nearbyPlaces.length > 0) {
      nearbyInfo = 'Nearby places:\n';
      nearbyPlaces.forEach((place, index) => {
        nearbyInfo += `${index + 1}. ${place.name}: ${place.vicinity || ''} (Rating: ${place.rating || 'N/A'})\n`;
      });
      nearbyInfo += '\n';
    }

    // Location information
    const locationInfo = location ? `Location: ${location}` : 'Location: Not specified';
    
    // Create a prompt with examples to guide the model
    const promptText = `${locationInfo}
User is looking for: ${prompt}
${nearbyInfo}
Task: Recommend 3 places matching the user's request. Format each recommendation exactly as shown in the examples below.

Example format:
---
PLACE: [Name of Place] [Rating as 1-5 stars using ★]
LOCATION: [Location details]
DESCRIPTION: [Brief description]
FEATURES: [Feature 1], [Feature 2]
INFO: [Additional information]
---

Example 1:
---
PLACE: Mountain View Trail ★★★★★
LOCATION: Northern Hills, 5km from city center
DESCRIPTION: A scenic trail with panoramic views of the valley and diverse vegetation
FEATURES: 3km moderate difficulty path, Birdwatching spots, Photography points
INFO: Open daily 6AM-6PM, Free entry, Guided tours available on weekends
---

Example 2:
---
PLACE: Riverside Walk ★★★★☆
LOCATION: Southern Pune, along Mula-Mutha River
DESCRIPTION: A peaceful riverside path perfect for morning or evening walks
FEATURES: Flat 2km trail, Sunset viewpoints, Picnic areas
INFO: Open 24/7, No entry fee, Best visited during early mornings
---

Now provide 3 recommendations for "${prompt}" ${location ? `in ${location}` : ''}:`;

    return promptText;
  }

  /**
   * Call Hugging Face API for language model inference
   * @param {string} prompt - Input prompt
   * @returns {Promise<Object>} - Model response
   */
  async callHuggingFaceAPI(prompt) {
    try {
      const url = `${this.apiUrl}${this.modelId}`;
      
      const payload = {
        inputs: prompt,
        parameters: {
          max_new_tokens: 800,
          temperature: 0.7,
          top_p: 0.95,
          do_sample: true,
          return_full_text: false,
          wait_for_model: true
        },
        options: {
          use_cache: true
        }
      };

      console.log('Hugging Face API URL:', url);
      console.log('Prompt length:', prompt.length);
      
      // Set a timeout for the API call
      const timeoutConfig = { timeout: 300000 }; // 5 minutes
      
      const response = await axios.post(url, payload, { 
        headers: this.headers,
        ...timeoutConfig
      });

      console.log('Response received, length:', response.data[0].generated_text.length);
      
      return {
        success: true,
        data: response.data[0].generated_text
      };
    } catch (error) {
      logger.error(`Error calling API: ${error.message}`);
      
      // Handle API errors
      if (error.response) {
        // The request was made and the server responded with a status code
        // that falls out of the range of 2xx
        logger.error(`API error: ${JSON.stringify(error.response.data)}`);
        return {
          success: false,
          error: error.response.data.error || error.message
        };
      } else if (error.request) {
        // The request was made but no response was received
        return {
          success: false,
          error: 'No response from API server'
        };
      } else {
        // Something happened in setting up the request
        return {
          success: false,
          error: error.message
        };
      }
    }
  }

  /**
   * Process the model's response to extract recommendations
   * @param {string} rawResponse - Raw text from the model
   * @param {string} prompt - Original user prompt
   * @param {string|null} location - Location (can be null)
   * @returns {Array} - Structured recommendations
   */
  processModelResponse(rawResponse, prompt, location) {
    try {
      // Look for recommendation blocks between "---" markers
      const recBlocks = rawResponse.split('---').filter(block => block.trim().length > 0);
      
      // If no valid blocks found with the marker approach, try to parse directly
      if (recBlocks.length === 0) {
        return this.extractRecommendationsDirectly(rawResponse, prompt, location);
      }
      
      const recommendations = [];
      
      for (const block of recBlocks) {
        const placeLine = block.match(/PLACE:\s*([^★\n]+)(★+☆*)?/i);
        if (!placeLine) continue;
        
        const name = placeLine[1] ? placeLine[1].trim() : 'Unknown Place';
        let rating = 4; // Default
        
        if (placeLine[2]) {
          const stars = placeLine[2];
          rating = (stars.match(/★/g) || []).length;
        }
        
        // Extract other details
        const locationMatch = block.match(/LOCATION:\s*([^\n]+)/i);
        const location = locationMatch ? locationMatch[1].trim() : '';
        
        const descMatch = block.match(/DESCRIPTION:\s*([^\n]+)/i);
        const description = descMatch ? descMatch[1].trim() : '';
        
        const featuresMatch = block.match(/FEATURES:\s*([^\n]+)/i);
        const features = featuresMatch ? 
          featuresMatch[1].split(',').map(f => f.trim()) : [];
        
        const infoMatch = block.match(/INFO:\s*([^\n]+)/i);
        const additionalInfo = infoMatch ? infoMatch[1].trim() : '';
        
        recommendations.push({
          name,
          rating,
          location,
          description,
          features,
          additionalInfo
        });
      }
      
      // If we couldn't parse any recommendations in the expected format,
      // fall back to direct extraction
      if (recommendations.length === 0) {
        return this.extractRecommendationsDirectly(rawResponse, prompt, location);
      }
      
      return recommendations;
    } catch (error) {
      logger.error(`Error processing model response: ${error.message}`);
      
      // If all parsing fails, create a basic structure from the raw response
      return this.extractRecommendationsDirectly(rawResponse, prompt, location);
    }
  }
  
  /**
   * Extract recommendations directly from text when structured parsing fails
   * @param {string} text - Raw response text
   * @param {string} prompt - Original user prompt
   * @param {string|null} location - Location (can be null)
   * @returns {Array} - Best-effort structured recommendations
   */
  extractRecommendationsDirectly(text, prompt, location) {
    // Try to find recommendation numbering patterns
    const recommendations = [];
    
    // Look for numbered patterns like "1." or "Recommendation 1:"
    const numPattern = /(?:^|\n)(?:Recommendation\s*)?(\d+)[:.]\s*([^\n]+)/g;
    let match;
    
    while ((match = numPattern.exec(text)) !== null) {
      const num = match[1];
      const content = match[2].trim();
      
      if (content.length > 0) {
        recommendations.push({
          name: `${content}`,
          rating: 4,
          location: location || 'Not specified',
          description: `Recommendation based on your request for "${prompt}"`,
          features: [],
          additionalInfo: `From model's recommendation #${num}`
        });
      }
    }
    
    // If still no recommendations found, split by double newlines
    if (recommendations.length === 0) {
      const paragraphs = text.split('\n\n').filter(p => p.trim().length > 10);
      
      paragraphs.slice(0, 3).forEach((paragraph, index) => {
        // Extract the first sentence or line as the name
        const firstLine = paragraph.split(/[.!?]|\n/)[0].trim();
        
        recommendations.push({
          name: firstLine || `Recommendation ${index + 1}`,
          rating: 4,
          location: location || 'Not specified',
          description: paragraph,
          features: [],
          additionalInfo: `Based on your request for "${prompt}"`
        });
      });
    }
    
    // If we still have no recommendations, create a single one from the entire text
    if (recommendations.length === 0) {
      recommendations.push({
        name: `Places for ${prompt}`,
        rating: 4,
        location: location || 'Not specified',
        description: text.trim(),
        features: [],
        additionalInfo: 'Based on model response'
      });
    }
    
    return recommendations;
  }

  /**
   * Generate text for a given prompt directly
   * @param {string} prompt - Input prompt
   * @param {Object} options - Optional parameters for generation
   * @returns {Promise<Object>} - Generated text
   */
  async generateText(prompt, options = {}) {
    try {
      const response = await this.callHuggingFaceAPI(prompt);
      
      if (!response.success) {
        return {
          success: false,
          message: 'Failed to generate text',
          error: response.error
        };
      }
      
      return {
        success: true,
        text: response.data,
        rawResponse: process.env.NODE_ENV === 'development' ? response.data : undefined
      };
    } catch (error) {
      logger.error(`Error generating text: ${error.message}`);
      return {
        success: false,
        message: 'Failed to generate text',
        error: error.message
      };
    }
  }
}

export default new GptService();