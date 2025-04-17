// services/prompt.service.js
import gptjService from './gptj.service.js';
import mapsService from './maps.service.js';
import logger from '../utils/logger.js';

/**
 * Process user input and generate appropriate prompts for the restaurant recommendation system
 */
class PromptService {
  /**
   * Process a natural language query from the user
   * @param {string} userInput - Raw user input text
   * @param {Object} userLocation - User's location coordinates (optional)
   * @returns {Promise<Object>} - Processed query with recommendations
   */
  async processUserQuery(userInput, userLocation = null) {
    try {
      // Step 1: Extract intent and location from user query
      const extractionResult = await this.extractQueryComponents(userInput);
      
      if (!extractionResult.success) {
        return extractionResult;
      }
      
      const { intent, locationQuery, cuisine, preferences } = extractionResult;
      
      // Step 2: Determine if we need to resolve location
      let locationId = null;
      let location = null;
      
      // If user didn't specify a location in query, use their current location if available
      if (!locationQuery && userLocation) {
        // Reverse geocode user location
        const geocodeResult = await mapsService.reverseGeocode(userLocation);
        if (geocodeResult.success) {
          locationId = geocodeResult.locationId;
          location = geocodeResult.address;
        }
      } else if (locationQuery) {
        // Search for the location user mentioned
        const searchResult = await mapsService.searchLocation(locationQuery);
        
        if (!searchResult.success) {
          return {
            success: false,
            message: 'Could not find the location you mentioned',
            needsLocationClarification: true,
            possibleLocations: []
          };
        }
        
        // If multiple locations found, we need clarification
        if (searchResult.locations.length > 1) {
          return {
            success: true,
            message: 'Please clarify which location you mean',
            needsLocationClarification: true,
            possibleLocations: searchResult.locations
          };
        }
        
        // We have a unique location
        locationId = searchResult.locations[0].place_id;
        location = searchResult.locations[0].formatted_address;
      } else {
        // No location provided or detected
        return {
          success: false,
          message: 'I need to know where to look for restaurants. Could you specify a location?',
          needsLocationClarification: true
        };
      }
      
      // Step 3: Build search query based on intent, cuisine and preferences
      let searchQuery = '';
      
      if (cuisine) {
        searchQuery += cuisine + ' ';
      }
      
      searchQuery += 'restaurants ';
      
      if (preferences) {
        searchQuery += preferences;
      }
      
      searchQuery = searchQuery.trim();
      if (!searchQuery) {
        searchQuery = 'restaurants';
      }
      
      // Step 4: Get recommendations using the existing recommendation flow
      const recommendationsResult = await this.getRecommendationsForQuery(locationId, searchQuery);
      
      if (!recommendationsResult.success) {
        return recommendationsResult;
      }
      
      // Step 5: Generate a natural language response
      const naturalResponse = await this.generateNaturalResponse({
        location,
        query: userInput,
        searchQuery,
        recommendations: recommendationsResult.recommendations
      });
      
      return {
        success: true,
        location: recommendationsResult.location,
        recommendations: recommendationsResult.recommendations,
        naturalResponse
      };
      
    } catch (error) {
      logger.error(`Error processing user query: ${error.message}`);
      return {
        success: false,
        message: 'Sorry, I had trouble processing your request'
      };
    }
  }
  
  /**
   * Extract components from a natural language query
   * @param {string} userInput - User's raw input
   * @returns {Promise<Object>} - Extracted intent and parameters
   */
  async extractQueryComponents(userInput) {
    try {
      // Create a prompt for the model to extract components
      const prompt = `
Extract the following components from this restaurant search query:
- Intent (find restaurant, make reservation, review restaurant, etc.)
- Location mentioned (specific area, neighborhood, city, "near me", or none)
- Cuisine or food type (if mentioned)
- Other preferences (price range, atmosphere, etc.)

Query: "${userInput}"

Format the output as follows:
Intent: [intent]
Location: [extracted location or "none"]
Cuisine: [extracted cuisine or "none"]
Preferences: [extracted preferences or "none"]
`;

      // Use GPT-J to extract components
      const result = await gptjService.generateText(prompt, {
        maxTokens: 200,
        temperature: 0.3
      });
      
      if (!result.success) {
        return {
          success: false,
          message: 'Failed to process your query'
        };
      }
      
      // Parse the generated text
      const lines = result.text.trim().split('\n');
      const components = {};
      
      for (const line of lines) {
        const [key, ...valueParts] = line.split(':');
        const value = valueParts.join(':').trim();
        
        if (key && value && value.toLowerCase() !== 'none') {
          components[key.toLowerCase()] = value;
        }
      }
      
      return {
        success: true,
        intent: components.intent || 'find restaurant',
        locationQuery: components.location || null,
        cuisine: components.cuisine || null,
        preferences: components.preferences || null
      };
      
    } catch (error) {
      logger.error(`Error extracting query components: ${error.message}`);
      return {
        success: false,
        message: 'Failed to understand your query'
      };
    }
  }
  
  /**
   * Get recommendations using the existing recommendation flow
   * @param {string} locationId - ID of the location
   * @param {string} query - Processed search query
   * @returns {Promise<Object>} - Recommendations
   */
  async getRecommendationsForQuery(locationId, query) {
    try {
      // Step 1: Get location details
      const locationDetails = await mapsService.getRestaurantDetails(locationId);
      if (!locationDetails.success) {
        return {
          success: false,
          message: 'Failed to get location details'
        };
      }
      
      const location = {
        name: locationDetails.details.name,
        address: locationDetails.details.address,
        lat: locationDetails.details.geometry?.location.lat,
        lng: locationDetails.details.geometry?.location.lng
      };
      
      // Step 2: Find nearby restaurants
      const nearbyResult = await mapsService.findNearbyRestaurants({
        location: {
          lat: location.lat,
          lng: location.lng
        },
        query,
        radius: 1500
      });
      
      if (!nearbyResult.success) {
        return nearbyResult;
      }
      
      // Step 3: Generate AI-enhanced recommendations
      const recommendations = await gptjService.generateRecommendations({
        location: locationDetails.details.address,
        query,
        nearbyRestaurants: nearbyResult.restaurants.slice(0, 5) // Limit to top 5 for AI processing
      });
      
      if (!recommendations.success) {
        return recommendations;
      }
      
      // Step 4: Enhance recommendations with real data
      const enhancedRecommendations = mapsService.enhanceRecommendationsWithRealData(
        recommendations.recommendations,
        nearbyResult.restaurants
      );
      
      return {
        success: true,
        location,
        recommendations: enhancedRecommendations
      };
    } catch (error) {
      logger.error(`Error getting recommendations: ${error.message}`);
      return {
        success: false,
        message: 'Failed to get recommendations'
      };
    }
  }
  
  /**
   * Generate a natural language response for the recommendations
   * @param {Object} params - Parameters for response generation
   * @returns {Promise<string>} - Natural language response
   */
  async generateNaturalResponse(params) {
    try {
      const { location, query, searchQuery, recommendations } = params;
      
      // Create a condensed version of recommendations for the prompt
      const recSummary = recommendations.map((rec, index) => {
        return `${index + 1}. ${rec.name} (${rec.rating}/5): ${rec.description.substring(0, 100)}${rec.description.length > 100 ? '...' : ''}`;
      }).join('\n');
      
      // Create a prompt for natural response generation
      const prompt = `
You are a helpful AI restaurant recommendation system. A user has asked: "${query}"

You searched for ${searchQuery} near ${location} and found these options:

${recSummary}

Please write a friendly, conversational response that:
1. Acknowledges their query
2. Mentions the location you searched
3. Summarizes the top recommendations in a natural way
4. Encourages them to ask for more details if needed

Keep the response under 150 words and conversational in tone.
`;

      // Generate the response
      const result = await gptjService.generateText(prompt, {
        maxTokens: 300,
        temperature: 0.7
      });
      
      if (!result.success) {
        return `Here are some restaurant recommendations near ${location} based on your search.`;
      }
      
      return result.text.trim();
      
    } catch (error) {
      logger.error(`Error generating natural response: ${error.message}`);
      return `Here are some restaurant recommendations near ${location} based on your search.`;
    }
  }
}

export default new PromptService();