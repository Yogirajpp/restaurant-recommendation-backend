// services/maps.service.js
import axios from 'axios';
import appConfig from '../config/app.config.js';
import logger from '../utils/logger.js';

/**
 * Maps Service for Google Maps and Places API integration
 * Using only the Google Maps API key for all requests
 */
class MapsService {
  constructor() {
    // Use only Google Maps API key for all requests
    this.apiKey = appConfig.google.maps.apiKey;
  }

  /**
   * Search for a location to resolve ambiguity
   * @param {string} query - Location query
   * @returns {Promise<Object>} - Location results
   */
  async searchLocation(query) {
    try {
      const response = await axios.get('https://maps.googleapis.com/maps/api/place/textsearch/json', {
        params: {
          query,
          key: this.apiKey
        }
      });
      
      if (response.data.status !== 'OK') {
        return {
          success: false,
          message: `Google API error: ${response.data.status}`,
          error: response.data.error_message
        };
      }
      
      // Format the results
      const locations = response.data.results.map(place => ({
        id: place.place_id,
        name: place.name,
        address: place.formatted_address,
        location: {
          lat: place.geometry.location.lat,
          lng: place.geometry.location.lng
        }
      }));
      
      return {
        success: true,
        locations
      };
    } catch (error) {
      logger.error(`Error searching location: ${error.message}`);
      return {
        success: false,
        message: 'Failed to search location',
        error: error.message
      };
    }
  }

  /**
   * Find nearby restaurants based on location and query
   * @param {Object} params - Search parameters
   * @param {Object} params.location - Latitude and longitude
   * @param {string} params.query - Search query
   * @param {number} params.radius - Search radius in meters
   * @returns {Promise<Object>} - Nearby places
   */
  async findNearbyRestaurants(params) {
    try {
      const { location, query, radius = 1500 } = params;
      
      const response = await axios.get('https://maps.googleapis.com/maps/api/place/nearbysearch/json', {
        params: {
          location: `${location.lat},${location.lng}`,
          radius,
          type: 'restaurant',
          keyword: query,
          key: this.apiKey
        }
      });
      
      if (response.data.status !== 'OK' && response.data.status !== 'ZERO_RESULTS') {
        return {
          success: false,
          message: `Google API error: ${response.data.status}`,
          error: response.data.error_message
        };
      }
      
      // Format the results
      const restaurants = response.data.results.map(place => ({
        id: place.place_id,
        name: place.name,
        rating: place.rating,
        userRatingsTotal: place.user_ratings_total,
        vicinity: place.vicinity,
        priceLevel: place.price_level,
        photos: place.photos?.map(photo => ({
          reference: photo.photo_reference,
          height: photo.height,
          width: photo.width
        })) || [],
        location: {
          lat: place.geometry.location.lat,
          lng: place.geometry.location.lng
        },
        openNow: place.opening_hours?.open_now
      }));
      
      return {
        success: true,
        restaurants
      };
    } catch (error) {
      logger.error(`Error finding nearby restaurants: ${error.message}`);
      return {
        success: false,
        message: 'Failed to find nearby restaurants',
        error: error.message
      };
    }
  }

  /**
   * Get detailed information about a specific restaurant
   * @param {string} placeId - Google Place ID
   * @returns {Promise<Object>} - Place details
   */
  async getRestaurantDetails(placeId) {
    try {
      const response = await axios.get('https://maps.googleapis.com/maps/api/place/details/json', {
        params: {
          place_id: placeId,
          fields: 'name,rating,formatted_phone_number,formatted_address,website,url,opening_hours,price_level,review,photo,user_ratings_total,geometry',
          key: this.apiKey
        }
      });
      
      if (response.data.status !== 'OK') {
        return {
          success: false,
          message: `Google API error: ${response.data.status}`,
          error: response.data.error_message
        };
      }
      
      const place = response.data.result;
      
      // Format the result
      const details = {
        id: placeId,
        name: place.name,
        rating: place.rating,
        userRatingsTotal: place.user_ratings_total,
        address: place.formatted_address,
        phoneNumber: place.formatted_phone_number,
        website: place.website,
        googleMapsUrl: place.url,
        priceLevel: place.price_level,
        openingHours: place.opening_hours?.weekday_text || [],
        geometry: place.geometry,
        reviews: place.reviews?.map(review => ({
          authorName: review.author_name,
          rating: review.rating,
          time: review.time,
          text: review.text
        })) || [],
        photos: place.photos?.map(photo => ({
          reference: photo.photo_reference,
          height: photo.height,
          width: photo.width
        })) || []
      };
      
      return {
        success: true,
        details
      };
    } catch (error) {
      logger.error(`Error getting restaurant details: ${error.message}`);
      return {
        success: false,
        message: 'Failed to get restaurant details',
        error: error.message
      };
    }
  }

  /**
   * Get a photo URL for a photo reference
   * @param {string} photoReference - Photo reference from Places API
   * @param {number} maxWidth - Maximum width of the photo
   * @returns {string} - Photo URL
   */
  getPhotoUrl(photoReference, maxWidth = 400) {
    return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=${maxWidth}&photoreference=${photoReference}&key=${this.apiKey}`;
  }

  /**
   * Enhance AI-generated recommendations with real data
   * @param {Array} aiRecommendations - AI-generated recommendations
   * @param {Array} realRestaurants - Real restaurant data from Google
   * @returns {Array} - Enhanced recommendations
   */
  enhanceRecommendationsWithRealData(aiRecommendations, realRestaurants) {
    const enhanced = [];
    
    for (const aiRec of aiRecommendations) {
      // Try to find a matching real restaurant
      const matchingRestaurant = this.findMatchingRestaurant(aiRec, realRestaurants);
      
      if (matchingRestaurant) {
        // Add photo URL
        const photoUrl = matchingRestaurant.photos && matchingRestaurant.photos.length > 0
          ? this.getPhotoUrl(matchingRestaurant.photos[0].reference)
          : null;
        
        enhanced.push({
          // AI-generated content
          name: aiRec.name,
          description: aiRec.description,
          dishes: aiRec.dishes,
          priceInfo: aiRec.priceInfo,
          
          // Real data
          placeId: matchingRestaurant.id,
          rating: matchingRestaurant.rating || aiRec.rating,
          userRatingsTotal: matchingRestaurant.userRatingsTotal,
          address: matchingRestaurant.vicinity,
          photoUrl,
          location: matchingRestaurant.location,
          priceLevel: matchingRestaurant.priceLevel,
          openNow: matchingRestaurant.openNow
        });
      } else {
        // Just use the AI recommendation
        enhanced.push({
          ...aiRec,
          photoUrl: null,
          placeId: null
        });
      }
    }
    
    return enhanced;
  }

  /**
   * Find a matching restaurant from real data
   * @param {Object} aiRec - AI-generated recommendation
   * @param {Array} realRestaurants - Real restaurant data from Google
   * @returns {Object|null} - Matching restaurant or null
   */
  findMatchingRestaurant(aiRec, realRestaurants) {
    // Try exact name match
    let match = realRestaurants.find(
      real => real.name.toLowerCase() === aiRec.name.toLowerCase()
    );
    
    if (match) return match;
    
    // Try fuzzy name match (contains)
    match = realRestaurants.find(
      real => real.name.toLowerCase().includes(aiRec.name.toLowerCase()) ||
              aiRec.name.toLowerCase().includes(real.name.toLowerCase())
    );
    
    return match || null;
  }
}

export default new MapsService();