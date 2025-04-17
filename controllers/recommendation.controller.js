// controllers/recommendation.controller.js
import gptjService from '../services/gptj.service.js';
import mapsService from '../services/maps.service.js';
import logger from '../utils/logger.js';

/**
 * Search for locations to resolve ambiguity
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} - JSON response
 */
const searchLocations = async (req, res) => {
  try {
    const { query } = req.query;
    
    if (!query) {
      return res.status(400).json({
        success: false,
        message: 'Location query is required'
      });
    }
    
    // Search locations using the Maps Service
    const result = await mapsService.searchLocation(query);
    
    if (!result.success) {
      return res.status(500).json(result);
    }
    
    return res.status(200).json({
      success: true,
      locations: result.locations
    });
  } catch (error) {
    logger.error(`Error in searchLocations: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

/**
 * Generate place recommendations (restaurants, sports venues, game places, nature spots, etc.)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} - JSON response
 */
const getRecommendations = async (req, res) => {
  try {
    const { locationId, prompt, placeType } = req.query;
    
    if (!prompt) {
      return res.status(400).json({
        success: false,
        message: 'A prompt is required'
      });
    }
    
    let location = null;
    let nearbyPlaces = [];
    
    // If locationId is provided, use it to get location details
    if (locationId) {
      // Step 1: Get location details
      const locationDetails = await mapsService.getPlaceDetails(locationId);
      if (!locationDetails.success) {
        return res.status(500).json({
          success: false,
          message: 'Failed to get location details'
        });
      }
      
      location = {
        name: locationDetails.details.name,
        address: locationDetails.details.address,
        lat: locationDetails.details.geometry?.location.lat,
        lng: locationDetails.details.geometry?.location.lng
      };
      
      // Step 2: Find nearby places
      const nearbyResult = await mapsService.findNearbyPlaces({
        location: {
          lat: location.lat,
          lng: location.lng
        },
        query: placeType || '',
        radius: 2000
      });
      
      if (nearbyResult.success) {
        nearbyPlaces = nearbyResult.places;
      }
    }
    
    // Step 3: Generate AI-enhanced recommendations
    const recommendations = await gptjService.generatePlaceRecommendations({
      location: location ? location.address : null,
      prompt,
      nearbyPlaces: nearbyPlaces.slice(0, 5) // Limit to top 5 for AI processing
    });
    
    if (!recommendations.success) {
      return res.status(500).json({
        success: false,
        message: recommendations.message || 'Failed to generate recommendations',
        error: recommendations.error || 'Unknown error'
      });
    }
    
    // Step 4: Return the response
    return res.status(200).json({
      success: true,
      location,
      recommendations: recommendations.recommendations
    });
  } catch (error) {
    logger.error(`Error in getRecommendations: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

/**
 * Get detailed information about a specific place
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} - JSON response
 */
const getPlaceDetails = async (req, res) => {
  try {
    const { placeId } = req.params;
    
    if (!placeId) {
      return res.status(400).json({
        success: false,
        message: 'Place ID is required'
      });
    }
    
    // Get place details
    const result = await mapsService.getPlaceDetails(placeId);
    
    if (!result.success) {
      return res.status(500).json(result);
    }
    
    // Add photo URLs if available
    let photos = [];
    if (result.details.photos && result.details.photos.length > 0) {
      photos = result.details.photos.map(photo => ({
        url: mapsService.getPhotoUrl(photo.reference),
        width: photo.width,
        height: photo.height
      }));
    }
    
    return res.status(200).json({
      success: true,
      details: {
        ...result.details,
        photos
      }
    });
  } catch (error) {
    logger.error(`Error in getPlaceDetails: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

/**
 * Generate text for a given prompt directly using the language model
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} - JSON response with generated text
 */
const generateText = async (req, res) => {
  try {
    const { prompt, options } = req.body;
    
    if (!prompt) {
      return res.status(400).json({
        success: false,
        message: 'Prompt is required'
      });
    }
    
    // Generate text using the language model
    const result = await gptjService.generateText(prompt, options);
    
    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: result.message || 'Failed to generate text',
        error: result.error || 'Unknown error'
      });
    }
    
    return res.status(200).json({
      success: true,
      generatedText: result.text,
      ...(process.env.NODE_ENV === 'development' ? { rawResponse: result.rawResponse } : {})
    });
  } catch (error) {
    logger.error(`Error in generateText: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

export default {
  searchLocations,
  getRecommendations,
  getPlaceDetails,
  generateText
};